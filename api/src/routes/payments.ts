import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { recalculateInvoice } from "../lib/invoiceLogic";

type InvoiceParams = { invoiceId: string };
export const invoicePaymentsRouter = Router({ mergeParams: true });

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  reference: z.string().optional(),
});

// POST /api/invoices/:invoiceId/payments — encaisser (§14). Les paiements
// sont toujours additifs : jamais d'écrasement, un paiement partiel vient
// s'ajouter aux précédents (cf. cahier des charges B12 sur ce même principe
// appliqué au hors-ligne — vrai aussi en ligne).
invoicePaymentsRouter.post(
  "/",
  requireRole("owner", "admin", "manager", "agent"),
  asyncHandler<InvoiceParams>(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de paiement invalides." });
    }

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: req.params.invoiceId } });
      if (!invoice) return null;

      // Le moyen de paiement doit être actif pour l'organisation (ou global).
      const method = await tx.paymentMethod.findFirst({
        where: {
          code: parsed.data.paymentMethod,
          isActive: true,
          OR: [{ organizationId: req.auth!.organizationId }, { organizationId: null }],
        },
      });
      if (!method) return { error: "invalid_payment_method" as const };
      if (method.requiresReference && !parsed.data.reference) {
        return { error: "reference_required" as const };
      }

      await tx.payment.create({
        data: {
          organizationId: req.auth!.organizationId,
          invoiceId: invoice.id,
          contractId: invoice.contractId,
          amount: parsed.data.amount,
          paymentMethod: parsed.data.paymentMethod,
          reference: parsed.data.reference,
          recordedBy: req.auth!.userId,
        },
      });

      return { invoice: await recalculateInvoice(tx, invoice.id) };
    });

    if (!result) {
      return res.status(404).json({ code: "not_found", message: "Facture introuvable." });
    }
    if ("error" in result) {
      const message =
        result.error === "invalid_payment_method"
          ? "Moyen de paiement invalide ou désactivé."
          : "Une référence est requise pour ce moyen de paiement.";
      return res.status(400).json({ code: result.error, message });
    }

    res.status(201).json(result.invoice);
  })
);
