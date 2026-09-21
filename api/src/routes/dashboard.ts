import { Router } from "express";
import { Prisma } from "@prisma/client";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { recalculateInvoice } from "../lib/invoiceLogic";

export const dashboardRouter = Router();

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/dashboard/summary — indicateurs du tableau de bord (cahier des
// charges §8) : uniquement ce qui est réellement calculable avec les modules
// construits à ce stade (pas de "dépenses"/"bénéfice" tant que ce module
// n'existe pas — mieux vaut ne rien afficher que des chiffres inventés).
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const [propertiesTotal, unitsTotal, unitsOccupied, activeContracts] = await Promise.all([
        tx.property.count({ where: { deletedAt: null } }),
        tx.unit.count({ where: { deletedAt: null } }),
        tx.unit.count({ where: { deletedAt: null, status: "occupied" } }),
        tx.contract.count({ where: { status: "active" } }),
      ]);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const revenueAgg = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { paymentDate: { gte: startOfMonth } },
      });

      // Recalcule chaque facture ouverte pour un solde dû à jour (même
      // logique que la liste Facturation), puis ne retient que celles
      // réellement échues : une facture "pending" dont l'échéance est dans
      // le futur n'est pas un impayé — seul le statut ne suffit pas à le
      // dire (une "partially_paid" peut très bien être payée d'avance),
      // il faut comparer la date d'échéance à aujourd'hui (même logique
      // que la page Impayés côté web).
      const openInvoices = await tx.invoice.findMany({
        where: { status: { in: ["pending", "partially_paid", "overdue"] } },
        select: { id: true },
      });
      const recalculated = await Promise.all(
        openInvoices.map((inv) => recalculateInvoice(tx, inv.id))
      );
      const lateInvoices = recalculated.filter((inv) => inv.dueDate < now);
      const outstandingAmount = lateInvoices.reduce((sum, inv) => {
        const paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
        const due = inv.amount.plus(inv.lateFeeAmount).minus(paid);
        return sum.plus(due.gt(0) ? due : 0);
      }, new Prisma.Decimal(0));
      const overdueCount = lateInvoices.length;

      // Encaissements des 6 derniers mois (regroupés en mémoire — volumétrie
      // MVP largement compatible, pas besoin de SQL brut pour l'instant).
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const recentPayments = await tx.payment.findMany({
        where: { paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true },
      });
      const byMonth = new Map<string, Prisma.Decimal>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        byMonth.set(monthKey(d), new Prisma.Decimal(0));
      }
      for (const p of recentPayments) {
        const key = monthKey(p.paymentDate);
        if (byMonth.has(key)) byMonth.set(key, byMonth.get(key)!.plus(p.amount));
      }

      return {
        propertiesTotal,
        unitsTotal,
        unitsOccupied,
        activeContracts,
        overdueCount,
        revenueThisMonth: (revenueAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
        outstandingAmount: outstandingAmount.toString(),
        monthlyRevenue: Array.from(byMonth.entries()).map(([month, total]) => ({
          month,
          total: total.toString(),
        })),
      };
    });

    // "Rapports financiers" (matrice de permissions, Partie 2) : ❌ pour
    // agent. Le compte, l'occupation et le nombre de contrats restent
    // visibles (👁 Propriétés) — seuls les agrégats monétaires du
    // portefeuille (chiffre d'affaires, total impayé, tendance) sont
    // retirés. `overdueCount` reste affiché : c'est un simple décompte,
    // et un agent voit déjà chaque facture en retard individuellement
    // (Paiements ✅, page Impayés).
    const isFinancialReportAllowed = ["owner", "admin", "manager"].includes(req.auth!.role);
    if (!isFinancialReportAllowed) {
      res.json({ ...result, revenueThisMonth: null, outstandingAmount: null, monthlyRevenue: [] });
      return;
    }

    res.json(result);
  })
);
