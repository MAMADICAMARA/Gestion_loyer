"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  ApiError,
  getInvoice,
  listPaymentMethods,
  openPaymentReceipt,
  recordPayment,
  type Invoice,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/api";
import { Modal } from "@/components/Modal";
import { CardIcon } from "@/components/icons";

const STATUS_LABEL: Record<InvoiceStatus, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-indigo-tint text-indigo" },
  partially_paid: { label: "Partielle", className: "bg-warning-tint text-warning" },
  paid: { label: "Payée", className: "bg-success-tint text-success" },
  overdue: { label: "En retard", className: "bg-critical-tint text-critical" },
  cancelled: { label: "Annulée", className: "bg-paper-2 text-sub" },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("fr-FR");
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);

  const [amount, setAmount] = useState("");
  const [methodCode, setMethodCode] = useState("cash");
  const [reference, setReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  function reload() {
    getInvoice(params.id)
      .then((inv) => {
        setInvoice(inv);
        const totalPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Number(inv.amount) + Number(inv.lateFeeAmount) - totalPaid;
        setAmount(remaining > 0 ? String(remaining) : "");
      })
      .catch(() => setError("Facture introuvable."));
  }

  useEffect(reload, [params.id]);
  useEffect(() => {
    listPaymentMethods().then(setMethods);
  }, []);

  const selectedMethod = methods.find((m) => m.code === methodCode);

  async function handleReceipt(paymentId: string) {
    setReceiptError(null);
    setReceiptLoadingId(paymentId);
    try {
      await openPaymentReceipt(params.id, paymentId);
    } catch (err) {
      setReceiptError(err instanceof ApiError ? err.message : "Impossible de générer le reçu.");
    } finally {
      setReceiptLoadingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!amount || Number(amount) <= 0) {
        throw new ApiError("invalid_input", "Le montant doit être positif.");
      }
      await recordPayment(params.id, {
        amount: Number(amount),
        paymentMethod: methodCode,
        reference: reference || undefined,
      });
      setReference("");
      setShowPayModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p-4 sm:p-8 text-sm text-critical">{error}</div>;
  if (!invoice) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  const status = STATUS_LABEL[invoice.status];
  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalDue = Number(invoice.amount) + Number(invoice.lateFeeAmount);
  const remaining = totalDue - totalPaid;
  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {invoice.contract.tenant.firstName} {invoice.contract.tenant.lastName}
          </h1>
          <p className="text-sm text-sub mt-1">
            {invoice.contract.unit.property.name} · {invoice.contract.unit.number} · Période{" "}
            {new Date(invoice.periodStart).toLocaleDateString("fr-FR")} –{" "}
            {new Date(invoice.periodEnd).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="text-xs font-bold text-sub uppercase mb-3">Facture</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
          <span className="text-sub">Loyer</span>
          <span className="text-ink font-mono">{fmt(invoice.amount)} GNF</span>
          {Number(invoice.lateFeeAmount) > 0 && (
            <>
              <span className="text-critical">Pénalité de retard</span>
              <span className="text-critical font-mono">+{fmt(invoice.lateFeeAmount)} GNF</span>
            </>
          )}
          <span className="text-sub">Échéance</span>
          <span className="text-ink">{new Date(invoice.dueDate).toLocaleDateString("fr-FR")}</span>
          <span className="text-sub font-semibold">Déjà réglé</span>
          <span className="text-ink font-mono font-semibold">{fmt(totalPaid)} GNF</span>
          {remaining > 0 && (
            <>
              <span className="text-sub font-semibold">Solde restant</span>
              <span className="text-ink font-mono font-semibold">{fmt(remaining)} GNF</span>
            </>
          )}
        </div>

        {invoice.payments.length > 0 && (
          <div className="mt-4 pt-3 border-t border-paper-2">
            <h3 className="text-xs font-bold text-sub uppercase mb-2">Historique</h3>
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap justify-between items-center gap-x-3 text-sm py-1">
                <span className="text-sub">
                  {new Date(p.paymentDate).toLocaleDateString("fr-FR")} · {p.paymentMethod}
                  {p.reference ? ` (${p.reference})` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-ink">{fmt(p.amount)} GNF</span>
                  <button
                    type="button"
                    onClick={() => handleReceipt(p.id)}
                    disabled={receiptLoadingId === p.id}
                    className="text-xs font-semibold text-indigo hover:underline disabled:opacity-60"
                  >
                    {receiptLoadingId === p.id ? "…" : "Reçu"}
                  </button>
                </span>
              </div>
            ))}
            {receiptError && <p className="text-xs text-critical mt-2">{receiptError}</p>}
          </div>
        )}

        {canPay ? (
          <button
            onClick={() => setShowPayModal(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition"
          >
            <CardIcon className="w-4 h-4" />
            Encaisser un paiement
          </button>
        ) : (
          <p className="mt-4 text-sm text-sub text-center">Facture soldée.</p>
        )}
      </div>

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Encaisser un paiement">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Montant (GNF)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Méthode</label>
            <div className="flex gap-1.5 flex-wrap">
              {methods.map((m) => (
                <button
                  type="button"
                  key={m.code}
                  onClick={() => setMethodCode(m.code)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                    methodCode === m.code
                      ? "bg-laterite-tint text-laterite border-laterite"
                      : "border-line text-sub"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {selectedMethod?.requiresReference && (
            <div>
              <label className="block text-xs font-semibold text-sub mb-1.5">Référence de transaction</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="ex. OM-TX-00219"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
          )}
          {formError && <p className="text-sm text-critical">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Confirmer l'encaissement"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
