import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Partagé avec les routes (routes/invoices.ts) : le detail d'un contrat doit
// rester présent après recalcul, sinon la liste des factures perd le
// locataire/local à chaque appel de recalculateInvoice().
export const invoiceWithRelations = {
  payments: { orderBy: { paymentDate: "desc" as const } },
  contract: {
    select: {
      id: true,
      tenant: { select: { id: true, firstName: true, lastName: true } },
      unit: { select: { id: true, number: true, property: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.InvoiceInclude;

/**
 * Calcule la pénalité de retard (A5) pour une facture donnée, selon la
 * première règle applicable : celle du contrat, sinon la règle par défaut
 * de l'organisation (contract_id NULL — cf. schema.sql §4).
 */
async function computeLateFee(
  tx: Tx,
  organizationId: string,
  contractId: string,
  amount: Prisma.Decimal,
  daysLate: number
): Promise<Prisma.Decimal> {
  if (daysLate <= 0) return new Prisma.Decimal(0);

  const rule =
    (await tx.lateFeeRule.findFirst({ where: { organizationId, contractId } })) ??
    (await tx.lateFeeRule.findFirst({ where: { organizationId, contractId: null } }));

  if (!rule) return new Prisma.Decimal(0);

  const effectiveDaysLate = daysLate - rule.gracePeriodDays;
  if (effectiveDaysLate <= 0) return new Prisma.Decimal(0);

  let fee: Prisma.Decimal;
  if (rule.calculationType === "fixed") {
    fee = rule.value;
  } else if (rule.calculationType === "percentage") {
    fee = amount.mul(rule.value).div(100);
  } else {
    // progressive : le taux s'applique par jour de retard effectif.
    fee = amount.mul(rule.value).div(100).mul(effectiveDaysLate);
  }

  if (rule.capAmount && fee.gt(rule.capAmount)) fee = rule.capAmount;
  return fee;
}

/**
 * Recalcule le statut et la pénalité d'une facture à partir de ses
 * paiements et de la date du jour — appelé à chaque lecture (pas de
 * planificateur de tâches pour l'instant, cf. feuille de route V2) et après
 * chaque enregistrement de paiement. Idempotent : ne réécrit en base que si
 * quelque chose a changé.
 */
export async function recalculateInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: invoiceWithRelations,
  });

  // "paid" et "cancelled" sont des états terminaux : une facture déjà soldée
  // ne doit jamais se voir infliger une pénalité a posteriori simplement
  // parce qu'on la consulte des jours après son règlement (la pénalité, le
  // cas échéant, a déjà été prise en compte au moment du dernier paiement
  // qui l'a soldée — cf. l'appel à recalculateInvoice après chaque paiement).
  if (invoice.status === "cancelled" || invoice.status === "paid") return invoice;

  const totalPaid = invoice.payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
  const today = new Date();
  const daysLate = Math.floor((today.getTime() - invoice.dueDate.getTime()) / 86_400_000);

  const lateFee = await computeLateFee(
    tx,
    invoice.organizationId,
    invoice.contractId,
    invoice.amount,
    daysLate
  );

  const amountDue = invoice.amount.plus(lateFee);
  let status: string;
  if (totalPaid.gte(amountDue) && amountDue.gt(0)) status = "paid";
  else if (totalPaid.gt(0)) status = "partially_paid";
  else if (daysLate > 0) status = "overdue";
  else status = "pending";

  if (status === invoice.status && lateFee.eq(invoice.lateFeeAmount)) {
    return invoice;
  }

  return tx.invoice.update({
    where: { id: invoiceId },
    data: { status, lateFeeAmount: lateFee },
    include: invoiceWithRelations,
  });
}

/** Ajoute un intervalle à une date selon la fréquence de paiement du contrat. */
export function addPeriod(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "semiannual":
      d.setMonth(d.getMonth() + 6);
      break;
    case "annual":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d;
}
