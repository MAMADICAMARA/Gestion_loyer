import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { logActivity } from "../lib/activityLog";
import { getLegalSettings } from "../lib/legalSettings";

export const settingsRouter = Router();

// GET /api/settings/legal — lecture ouverte à tout le personnel de l'agence
// (un manager qui crée un contrat doit pouvoir voir le préavis configuré),
// seule la modification (PATCH ci-dessous) est réservée owner/admin, comme
// la ligne "Paramètres" de la matrice de permissions (Partie 2).
settingsRouter.get(
  "/legal",
  asyncHandler(async (req, res) => {
    const settings = await withOrgContext(req.auth!.organizationId, (tx) =>
      getLegalSettings(tx, req.auth!.organizationId)
    );
    res.json(settings);
  })
);

const updateLegalSchema = z.object({
  noticePeriodDays: z.number().int().min(0).max(365),
  depositCapMonths: z.number().positive().max(12).nullable(),
  terminationReasons: z.array(z.string().min(1).max(50)).min(1),
});

settingsRouter.patch(
  "/legal",
  requireRole("owner", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = updateLegalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Paramètres invalides." });
    }

    const updated = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const saved = await tx.organizationSettings.upsert({
        where: { organizationId: req.auth!.organizationId },
        create: { organizationId: req.auth!.organizationId, ...parsed.data },
        update: parsed.data,
      });

      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "update",
        entityType: "organization_settings",
        entityId: null,
        metadata: parsed.data,
      });

      return saved;
    });

    res.json({
      noticePeriodDays: updated.noticePeriodDays,
      depositCapMonths: updated.depositCapMonths ? Number(updated.depositCapMonths) : null,
      terminationReasons: updated.terminationReasons,
    });
  })
);
