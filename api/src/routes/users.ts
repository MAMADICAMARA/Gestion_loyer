import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";

export const usersRouter = Router();

// GET /api/users — réservé owner/admin (matrice de permissions, Partie 2).
//
// IMPORTANT : contrairement à toutes les autres tables, `users` ne porte
// AUCUNE policy RLS (schema.sql) — et c'est volontaire : le login
// (routes/auth.ts) doit pouvoir chercher un compte par email avant même de
// connaître son organisation, ce que la RLS "fail closed" empêcherait. La
// contrepartie : chaque requête ICI doit filtrer organizationId à la main,
// withOrgContext() ne protège pas cette table. Deux bugs réels trouvés par
// test croisé entre organisations : le GET fuitait tous les comptes de
// toutes les agences, et le PATCH pouvait modifier le compte de n'importe
// qui par simple devinette d'UUID.
usersRouter.get(
  "/",
  requireRole("owner", "admin"),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    // les comptes portail (owner_viewer) se gèrent depuis la fiche propriétaire
    const where = { organizationId: req.auth!.organizationId, role: { not: "owner_viewer" as const } };

    const [total, users] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.user.count({ where }),
        tx.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ])
    );
    res.json(paginate(users, total, pagination));
  })
);

const AGENCY_ROLES = ["owner", "admin", "manager", "agent"] as const;

const inviteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "8 caractères minimum."),
  role: z.enum(AGENCY_ROLES),
  phone: z.string().optional(),
});

// POST /api/users — inviter un collègue. Mot de passe initial saisi par
// l'admin (même choix que pour l'accès portail propriétaire — pas de canal
// d'envoi d'email/SMS en place tant que le module Notifications n'existe
// pas, cf. cahier des charges V2).
usersRouter.post(
  "/",
  requireRole("owner", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Email, mot de passe (8 car. min.) et rôle requis." });
    }

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: parsed.data.email } });
      if (existing) return null;

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      return tx.user.create({
        data: {
          organizationId: req.auth!.organizationId,
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash,
          role: parsed.data.role,
        },
        select: { id: true, email: true, role: true, isActive: true, createdAt: true },
      });
    });

    if (!result) {
      return res.status(409).json({ code: "email_taken", message: "Cet email est déjà utilisé." });
    }
    res.status(201).json(result);
  })
);

const updateUserSchema = z.object({
  role: z.enum(AGENCY_ROLES).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/users/:id — changer le rôle ou activer/désactiver un compte.
// Un utilisateur ne peut pas se désactiver lui-même (garde-fou minimal
// contre le verrouillage accidentel du seul compte connecté).
usersRouter.patch(
  "/:id",
  requireRole("owner", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs invalides." });
    }
    if (req.params.id === req.auth!.userId && parsed.data.isActive === false) {
      return res.status(400).json({ code: "cannot_self_deactivate", message: "Vous ne pouvez pas désactiver votre propre compte." });
    }

    const result = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.user.updateMany({
        where: {
          id: req.params.id,
          organizationId: req.auth!.organizationId,
          role: { not: "owner_viewer" },
        },
        data: parsed.data,
      })
    );
    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Utilisateur introuvable." });
    }
    res.status(204).send();
  })
);
