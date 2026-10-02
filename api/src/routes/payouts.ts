import { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { logActivity } from "../lib/activityLog";

type OwnerParams = { id: string };
export const ownerPayoutsRouter = Router({ mergeParams: true });

ownerPayoutsRouter.get(
  "/",
  asyncHandler<OwnerParams>(async (req, res) => {
    const payouts = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.ownerPayout.findMany({
        where: { ownerId: req.params.id },
        orderBy: { periodStart: "desc" },
      })
    );
    res.json(payouts);
  })
);

const generateSchema = z.object({
  periodStart: z.string().optional(), // défaut : le 1er du mois en cours
});

// POST /api/owners/:id/payouts/generate — calcule le versement d'un
// propriétaire pour une période (§A3/A4) : somme des paiements encaissés sur
// la période pour les contrats liés aux biens de ce propriétaire, moins la
// commission d'agence (règle du propriétaire, sinon 0 si aucune n'est
// définie — mieux vaut 0 explicite qu'un taux deviné). Pas de "dépenses"
// déduites tant que ce module n'existe pas (même principe qu'au tableau de
// bord — Partie 5).
ownerPayoutsRouter.post(
  "/generate",
  requireRole("owner", "admin", "manager"),
  asyncHandler<OwnerParams>(async (req: Request<OwnerParams>, res: Response) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Période invalide." });
    }

    const now = new Date();
    const periodStart = parsed.data.periodStart
      ? new Date(parsed.data.periodStart)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const owner = await tx.owner.findFirst({ where: { id: req.params.id } });
      if (!owner) return null;

      // Tous les paiements de la période pour des contrats liés à un local
      // d'une propriété de ce propriétaire.
      const payments = await tx.payment.findMany({
        where: {
          paymentDate: { gte: periodStart, lt: new Date(periodEnd.getTime() + 86_400_000) },
          contract: { unit: { property: { ownerId: owner.id } } },
        },
        select: { amount: true },
      });
      const grossRentCollected = payments.reduce(
        (sum, p) => sum.plus(p.amount),
        new Prisma.Decimal(0)
      );

      const rule = await tx.agencyCommissionRule.findFirst({
        where: { ownerId: owner.id, propertyId: null },
      });
      const commissionAmount = rule
        ? grossRentCollected.mul(rule.ratePercentage).div(100)
        : new Prisma.Decimal(0);

      const netAmount = grossRentCollected.minus(commissionAmount);

      // Un versement par propriétaire et par période — régénérer met à jour
      // plutôt que de dupliquer (utile si des paiements arrivent après coup).
      const existing = await tx.ownerPayout.findFirst({
        where: { ownerId: owner.id, periodStart },
      });

      const data = {
        periodStart,
        periodEnd,
        grossRentCollected,
        commissionAmount,
        expensesDeducted: new Prisma.Decimal(0),
        netAmount,
      };

      if (existing && existing.status === "paid") return { error: "already_paid" as const };

      const payout = existing
        ? await tx.ownerPayout.update({ where: { id: existing.id }, data })
        : await tx.ownerPayout.create({
            data: { organizationId: req.auth!.organizationId, ownerId: owner.id, ...data },
          });

      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: existing ? "update" : "create",
        entityType: "owner_payout",
        entityId: payout.id,
        metadata: { ownerId: owner.id, netAmount: payout.netAmount.toString() },
      });

      return { payout };
    });

    if (!result) return res.status(404).json({ code: "not_found", message: "Propriétaire introuvable." });
    if ("error" in result) {
      return res
        .status(409)
        .json({ code: result.error, message: "Ce versement est déjà marqué payé — non régénérable." });
    }
    res.status(201).json(result.payout);
  })
);

// PATCH /api/payouts/:id — marquer un versement comme payé.
export const payoutsRouter = Router();

payoutsRouter.patch(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const updated = await tx.ownerPayout.updateMany({
        where: { id: req.params.id, status: "pending" },
        data: { status: "paid", paidAt: new Date() },
      });
      if (updated.count > 0) {
        await logActivity(tx, {
          organizationId: req.auth!.organizationId,
          userId: req.auth!.userId,
          action: "update",
          entityType: "owner_payout",
          entityId: req.params.id,
          metadata: { status: "paid" },
        });
      }
      return updated;
    });
    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Versement introuvable ou déjà payé." });
    }
    res.status(204).send();
  })
);
