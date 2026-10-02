import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";
import { logActivity } from "../lib/activityLog";

export const ownersRouter = Router();

const createOwnerSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

// GET /api/owners — liste paginée, tout rôle authentifié de l'organisation.
ownersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const [total, owners] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.owner.count(),
        tx.owner.findMany({ orderBy: { fullName: "asc" }, skip: pagination.skip, take: pagination.take }),
      ])
    );
    res.json(paginate(owners, total, pagination));
  })
);

// POST /api/owners — réservé owner/admin/manager (cf. matrice de permissions).
ownersRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = createOwnerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Nom du propriétaire requis." });
    }

    const owner = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const created = await tx.owner.create({
        data: {
          organizationId: req.auth!.organizationId,
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
          email: parsed.data.email,
        },
      });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "owner",
        entityId: created.id,
        metadata: { fullName: created.fullName },
      });
      return created;
    });
    res.status(201).json(owner);
  })
);

// GET /api/owners/:id — fiche propriétaire (biens, règle de commission, accès portail).
ownersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const owner = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const found = await tx.owner.findFirst({
        where: { id: req.params.id },
        include: {
          properties: { where: { deletedAt: null }, select: { id: true, name: true } },
          commissionRules: { where: { propertyId: null }, take: 1 },
        },
      });
      if (!found) return null;
      const { userId, commissionRules, ...rest } = found;
      return { ...rest, hasPortalAccess: userId !== null, commissionRule: commissionRules[0] ?? null };
    });
    if (!owner) return res.status(404).json({ code: "not_found", message: "Propriétaire introuvable." });
    res.json(owner);
  })
);

const commissionRuleSchema = z.object({
  ratePercentage: z.number().min(0).max(100),
  calculationBase: z.enum(["gross", "net"]).optional(),
});

// PATCH /api/owners/:id/commission-rule — un seul taux par défaut par
// propriétaire pour le MVP (pas de granularité par bien pour l'instant,
// cf. A4 — le raffinement par propriété pourra s'ajouter plus tard sans
// casser ce contrat : property_id reste nullable dans le schéma).
ownersRouter.patch(
  "/:id/commission-rule",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = commissionRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Taux de commission invalide (0-100)." });
    }

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const owner = await tx.owner.findFirst({ where: { id: req.params.id } });
      if (!owner) return null;

      const existing = await tx.agencyCommissionRule.findFirst({
        where: { ownerId: owner.id, propertyId: null },
      });

      const rule = existing
        ? await tx.agencyCommissionRule.update({
            where: { id: existing.id },
            data: {
              ratePercentage: parsed.data.ratePercentage,
              calculationBase: parsed.data.calculationBase ?? existing.calculationBase,
            },
          })
        : await tx.agencyCommissionRule.create({
            data: {
              organizationId: req.auth!.organizationId,
              ownerId: owner.id,
              ratePercentage: parsed.data.ratePercentage,
              calculationBase: parsed.data.calculationBase ?? "gross",
            },
          });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: existing ? "update" : "create",
        entityType: "commission_rule",
        entityId: rule.id,
        metadata: { ownerId: owner.id, ratePercentage: rule.ratePercentage.toString() },
      });
      return rule;
    });

    if (!result) return res.status(404).json({ code: "not_found", message: "Propriétaire introuvable." });
    res.json(result);
  })
);

const portalAccessSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "8 caractères minimum."),
});

// POST /api/owners/:id/portal-access — crée le compte owner_viewer (A3) lié
// à ce propriétaire. Un seul compte par propriétaire pour l'instant.
ownersRouter.post(
  "/:id/portal-access",
  requireRole("owner", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = portalAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Email et mot de passe (8 caractères min.) requis." });
    }

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const owner = await tx.owner.findFirst({ where: { id: req.params.id } });
      if (!owner) return { error: "owner_not_found" as const };
      if (owner.userId) return { error: "already_has_access" as const };

      const existingUser = await tx.user.findUnique({ where: { email: parsed.data.email } });
      if (existingUser) return { error: "email_taken" as const };

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await tx.user.create({
        data: {
          organizationId: req.auth!.organizationId,
          email: parsed.data.email,
          passwordHash,
          role: "owner_viewer",
        },
      });
      await tx.owner.update({ where: { id: owner.id }, data: { userId: user.id } });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "portal_access",
        entityId: user.id,
        metadata: { ownerId: owner.id, email: user.email },
      });
      return { user };
    });

    if ("error" in result) {
      if (result.error === "owner_not_found") {
        return res.status(404).json({ code: result.error, message: "Propriétaire introuvable." });
      }
      if (result.error === "already_has_access") {
        return res.status(409).json({ code: result.error, message: "Ce propriétaire a déjà un accès portail." });
      }
      return res.status(409).json({ code: result.error, message: "Cet email est déjà utilisé." });
    }

    res.status(201).json({ id: result.user.id, email: result.user.email });
  })
);
