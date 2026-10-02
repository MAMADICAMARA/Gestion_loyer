import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { storage, localStorage } from "../lib/storage";
import { logActivity } from "../lib/activityLog";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo — largement suffisant pour une pièce d'identité ou un contrat scanné
});

const RELATED_TYPES = ["tenant", "contract", "guarantor", "property", "owner"] as const;
type RelatedType = (typeof RELATED_TYPES)[number];

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

// Vérifie que l'élément ciblé existe et appartient à l'organisation de
// l'appelant — la RLS filtre déjà chaque findFirst (résultat vide = accès
// refusé/inexistant), même principe que partout ailleurs dans l'API.
async function relatedEntityExists(
  tx: Prisma.TransactionClient,
  relatedType: RelatedType,
  relatedId: string
): Promise<boolean> {
  switch (relatedType) {
    case "tenant":
      return !!(await tx.tenant.findFirst({ where: { id: relatedId, deletedAt: null }, select: { id: true } }));
    case "contract":
      return !!(await tx.contract.findFirst({ where: { id: relatedId }, select: { id: true } }));
    case "guarantor":
      return !!(await tx.guarantor.findFirst({ where: { id: relatedId }, select: { id: true } }));
    case "property":
      return !!(await tx.property.findFirst({ where: { id: relatedId, deletedAt: null }, select: { id: true } }));
    case "owner":
      return !!(await tx.owner.findFirst({ where: { id: relatedId }, select: { id: true } }));
  }
}

const uploadSchema = z.object({
  relatedType: z.enum(RELATED_TYPES),
  relatedId: z.string().uuid(),
});

// POST /api/documents — upload direct (multipart), pas d'URL présignée côté
// navigateur pour l'instant (optimisation V2) : le fichier transite par
// l'API, qui vérifie son type/sa taille et son rattachement avant de le
// déposer dans le stockage objet.
documentsRouter.post(
  "/",
  requireRole("owner", "admin", "manager", "agent"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "relatedType/relatedId invalides." });
    }
    if (!req.file) {
      return res.status(400).json({ code: "no_file", message: "Aucun fichier reçu." });
    }
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      return res
        .status(400)
        .json({ code: "unsupported_type", message: "Type de fichier non supporté (PDF, PNG, JPEG, WEBP uniquement)." });
    }

    const { relatedType, relatedId } = parsed.data;
    const file = req.file;

    const document = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const exists = await relatedEntityExists(tx, relatedType, relatedId);
      if (!exists) return null;

      const key = `${req.auth!.organizationId}/${relatedType}/${relatedId}/${crypto.randomUUID()}-${file.originalname}`;
      await storage.put(key, file.buffer, file.mimetype);

      const created = await tx.document.create({
        data: {
          organizationId: req.auth!.organizationId,
          relatedType,
          relatedId,
          fileName: file.originalname,
          fileUrl: key,
          fileType: file.mimetype,
          uploadedBy: req.auth!.userId,
        },
      });

      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "document",
        entityId: created.id,
        metadata: { relatedType, relatedId, fileName: created.fileName },
      });

      return created;
    });

    if (!document) {
      return res.status(404).json({ code: "not_found", message: "Élément associé introuvable." });
    }
    res.status(201).json({ ...document, downloadUrl: await storage.getSignedUrl(document.fileUrl) });
  })
);

const listQuerySchema = z.object({
  relatedType: z.enum(RELATED_TYPES),
  relatedId: z.string().uuid(),
});

// GET /api/documents?relatedType=&relatedId= — chaque document revient avec
// une downloadUrl signée à durée limitée (5 min), jamais une URL persistée :
// une URL S3 présignée expire, autant ne jamais la stocker telle quelle.
documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "relatedType et relatedId requis." });
    }

    const docs = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.document.findMany({
        where: { relatedType: parsed.data.relatedType, relatedId: parsed.data.relatedId },
        orderBy: { createdAt: "desc" },
      })
    );

    const withUrls = await Promise.all(
      docs.map(async (d) => ({ ...d, downloadUrl: await storage.getSignedUrl(d.fileUrl) }))
    );
    res.json(withUrls);
  })
);

documentsRouter.delete(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const doc = await tx.document.findFirst({ where: { id: req.params.id } });
      if (!doc) return null;
      await tx.document.delete({ where: { id: doc.id } });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "delete",
        entityType: "document",
        entityId: doc.id,
        metadata: { fileName: doc.fileName },
      });
      return doc;
    });

    if (!result) {
      return res.status(404).json({ code: "not_found", message: "Document introuvable." });
    }
    await storage.remove(result.fileUrl);
    res.status(204).send();
  })
);

// GET /api/documents/raw/* — UNIQUEMENT actif quand le backend disque local
// (dev/démo, cf. lib/storage.ts) est utilisé. Monté SANS requireAuth dans
// index.ts, comme un vrai endpoint de stockage objet public : la signature
// HMAC + l'expiration dans l'URL sont l'autorisation, exactement le rôle
// que joue la signature d'une URL S3 présignée — un jeton de session n'a
// rien à faire ici.
export const documentsRawRouter = Router();
documentsRawRouter.get(
  "/raw/*",
  asyncHandler(async (req, res) => {
    if (!localStorage) {
      return res.status(404).json({ code: "not_found", message: "Stockage local désactivé (S3 actif)." });
    }
    const key = decodeURIComponent(req.params[0]);
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");
    if (!exp || !sig || !localStorage.verify(key, exp, sig)) {
      return res.status(403).json({ code: "invalid_signature", message: "URL de téléchargement invalide ou expirée." });
    }
    try {
      const data = await localStorage.read(key);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(data);
    } catch {
      res.status(404).json({ code: "not_found", message: "Fichier introuvable." });
    }
  })
);
