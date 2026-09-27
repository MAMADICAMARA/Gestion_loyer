import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { recalculateInvoice } from "../lib/invoiceLogic";
import { renderReceiptPdf } from "../lib/receiptPdf";

type InvoiceParams = { invoiceId: string };
type PaymentParams = InvoiceParams & { paymentId: string };
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

// GET /api/invoices/:invoiceId/payments/:paymentId/receipt — reçu PDF (§14 :
// "Actions : PDF, imprimer, partager, envoyer"). Pas de table dédiée : le
// reçu est reconstruit à la volée depuis `payments` + la facture/contrat
// associés, comme documenté dans le module Reçus de paiement du cahier des
// charges ("Renvoi BDD : Généré depuis payments").
invoicePaymentsRouter.get(
  "/:paymentId/receipt",
  asyncHandler<PaymentParams>(async (req, res) => {
    const receipt = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: req.params.paymentId, invoiceId: req.params.invoiceId },
      });
      if (!payment) return null;

      const invoice = await recalculateInvoice(tx, req.params.invoiceId);

      const property = await tx.property.findFirst({
        where: { id: invoice.contract.unit.property.id },
        select: { name: true, owner: { select: { fullName: true } } },
      });

      const organization = await tx.organization.findFirst({
        where: { id: req.auth!.organizationId },
        select: { name: true },
      });

      const method = await tx.paymentMethod.findFirst({
        where: {
          code: payment.paymentMethod,
          OR: [{ organizationId: req.auth!.organizationId }, { organizationId: null }],
        },
        select: { label: true },
      });

      const totalPaid = invoice.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      const totalDue = invoice.amount.plus(invoice.lateFeeAmount);
      const remaining = totalDue.minus(totalPaid);

      return {
        receiptNumber: `REC-${payment.id.slice(0, 8).toUpperCase()}`,
        organizationName: organization?.name ?? "—",
        ownerName: property?.owner.fullName ?? "—",
        tenantName: `${invoice.contract.tenant.firstName} ${invoice.contract.tenant.lastName}`,
        propertyName: property?.name ?? invoice.contract.unit.property.name,
        unitNumber: invoice.contract.unit.number,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        amount: payment.amount.toString(),
        paymentMethodLabel: method?.label ?? payment.paymentMethod,
        reference: payment.reference,
        paymentDate: payment.paymentDate,
        remainingBalance: (remaining.gt(0) ? remaining : new Prisma.Decimal(0)).toString(),
      };
    });

    if (!receipt) {
      return res.status(404).json({ code: "not_found", message: "Paiement introuvable." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${receipt.receiptNumber}.pdf"`);
    const doc = renderReceiptPdf(receipt);
    doc.pipe(res);
    doc.end();
  })
);
