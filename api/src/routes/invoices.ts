import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { addPeriod, recalculateInvoice } from "../lib/invoiceLogic";
import { parsePagination, paginate } from "../lib/pagination";
import { logActivity } from "../lib/activityLog";

// GET /api/invoices — toutes les factures de l'organisation (module Facturation).
export const invoicesRouter = Router();

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const [total, invoices] = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const [count, list] = await Promise.all([
        tx.invoice.count(),
        tx.invoice.findMany({
          select: { id: true },
          orderBy: { dueDate: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ]);
      // Recalcul à la lecture (pas de planificateur pour l'instant — cf. roadmap V2) ;
      // recalculateInvoice() renvoie déjà les relations (contract, payments).
      const recalculated = await Promise.all(list.map((inv) => recalculateInvoice(tx, inv.id)));
      return [count, recalculated] as const;
    });
    res.json(paginate(invoices, total, pagination));
  })
);

invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const invoice = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const existing = await tx.invoice.findFirst({ where: { id: req.params.id } });
      if (!existing) return null;
      return recalculateInvoice(tx, req.params.id);
    });
    if (!invoice) {
      return res.status(404).json({ code: "not_found", message: "Facture introuvable." });
    }
    res.json(invoice);
  })
);

// --- Sous-ressource : factures d'un contrat ---
type ContractParams = { contractId: string };
export const contractInvoicesRouter = Router({ mergeParams: true });

contractInvoicesRouter.get(
  "/",
  asyncHandler<ContractParams>(async (req, res) => {
    const invoices = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.invoice.findMany({
        where: { contractId: req.params.contractId },
        orderBy: { periodStart: "desc" },
      })
    );
    res.json(invoices);
  })
);

// POST /api/contracts/:contractId/invoices — génère la prochaine facture du
// contrat (MVP : déclenchée manuellement par l'agent ; l'automatisation
// périodique — cahier des charges §42 — est prévue en V2 avec Celery/cron).
contractInvoicesRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler<ContractParams>(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({ where: { id: req.params.contractId } });
      if (!contract) return { error: "contract_not_found" as const };
      if (contract.status !== "active") return { error: "contract_not_active" as const };

      const lastInvoice = await tx.invoice.findFirst({
        where: { contractId: contract.id },
        orderBy: { periodEnd: "desc" },
      });

      const periodStart = new Date(lastInvoice ? lastInvoice.periodEnd : contract.startDate);
      if (lastInvoice) periodStart.setDate(periodStart.getDate() + 1);

      const periodEnd = addPeriod(periodStart, contract.paymentFrequency);
      periodEnd.setDate(periodEnd.getDate() - 1);

      // L'échéance calendaire (dueDay du mois de periodStart) peut tomber
      // avant periodStart lui-même quand le contrat démarre en cours de mois
      // (ex. contrat débutant le 21, échéance réglée sur le 5) — dans ce cas
      // on la reporte au mois suivant pour ne jamais facturer une échéance
      // déjà passée au moment où la période commence.
      const dueDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), contract.dueDay);
      if (dueDate < periodStart) dueDate.setMonth(dueDate.getMonth() + 1);

      const invoice = await tx.invoice.create({
        data: {
          organizationId: req.auth!.organizationId,
          contractId: contract.id,
          periodStart,
          periodEnd,
          amount: contract.rentAmount,
          dueDate,
        },
      });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { contractId: contract.id, amount: invoice.amount.toString() },
      });
      return { invoice };
    });

    if ("error" in result) {
      const status = result.error === "contract_not_found" ? 404 : 400;
      const message =
        result.error === "contract_not_found"
          ? "Contrat introuvable."
          : "Seul un contrat actif peut être facturé.";
      return res.status(status).json({ code: result.error, message });
    }
    res.status(201).json(result.invoice);
  })
);
