"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ApiError,
  createGuarantor,
  generateInvoice,
  getContract,
  getLegalSettings,
  listContractInvoices,
  updateContractStatus,
  type Contract,
  type ContractStatus,
  type Invoice,
  type InvoiceStatus,
  type LegalSettings,
} from "@/lib/api";
import { CardIcon, PlusIcon, ShieldIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { reasonLabel } from "@/lib/legalReasons";

const STATUS_LABEL: Record<ContractStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-paper-2 text-sub" },
  active: { label: "Actif", className: "bg-success-tint text-success" },
  suspended: { label: "Suspendu", className: "bg-warning-tint text-warning" },
  terminated: { label: "Résilié", className: "bg-critical-tint text-critical" },
  expired: { label: "Expiré", className: "bg-critical-tint text-critical" },
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-indigo-tint text-indigo" },
  partially_paid: { label: "Partielle", className: "bg-warning-tint text-warning" },
  paid: { label: "Payée", className: "bg-success-tint text-success" },
  overdue: { label: "En retard", className: "bg-critical-tint text-critical" },
  cancelled: { label: "Annulée", className: "bg-paper-2 text-sub" },
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuarantorModal, setShowGuarantorModal] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [guaranteedAmount, setGuaranteedAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [legal, setLegal] = useState<LegalSettings | null>(null);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminationReason, setTerminationReason] = useState("");
  const [terminateError, setTerminateError] = useState<string | null>(null);
  const [terminating, setTerminating] = useState(false);

  function reload() {
    getContract(params.id)
      .then(setContract)
      .catch(() => setError("Contrat introuvable."));
  }

  function reloadInvoices() {
    listContractInvoices(params.id).then(setInvoices);
  }

  useEffect(reload, [params.id]);
  useEffect(reloadInvoices, [params.id]);
  useEffect(() => {
    getLegalSettings()
      .then((s) => {
        setLegal(s);
        setTerminationReason(s.terminationReasons[0] ?? "");
      })
      .catch(() => {});
  }, []);

  async function handleGenerateInvoice() {
    setInvoiceError(null);
    setGenerating(true);
    try {
      await generateInvoice(params.id);
      reloadInvoices();
    } catch (err) {
      setInvoiceError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddGuarantor(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!fullName.trim()) throw new ApiError("invalid_input", "Le nom du garant est requis.");
      await createGuarantor(params.id, {
        fullName,
        phone: phone || undefined,
        relationship: relationship || undefined,
        guaranteedAmount: guaranteedAmount ? Number(guaranteedAmount) : undefined,
      });
      setFullName("");
      setPhone("");
      setRelationship("");
      setGuaranteedAmount("");
      setShowGuarantorModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmTerminate() {
    setTerminateError(null);
    setTerminating(true);
    try {
      await updateContractStatus(params.id, "terminated", terminationReason);
      setShowTerminateModal(false);
      reload();
    } catch (err) {
      setTerminateError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setTerminating(false);
    }
  }

  if (error) return <div className="p-4 sm:p-8 text-sm text-critical">{error}</div>;
  if (!contract) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  const status = STATUS_LABEL[contract.status];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {contract.tenant.firstName} {contract.tenant.lastName}
          </h1>
          <p className="text-sm text-sub mt-1">
            {contract.unit.property.name} · {contract.unit.number} ({contract.unit.unitType})
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="rounded-xl border border-line bg-white p-5 mb-4">
        <h2 className="text-xs font-bold text-sub uppercase mb-3">Conditions</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
          <span className="text-sub">Loyer mensuel</span>
          <span className="text-ink font-mono font-semibold">
            {Number(contract.rentAmount).toLocaleString("fr-FR")} GNF
          </span>
          <span className="text-sub">Caution</span>
          <span className="text-ink font-mono">
            {contract.depositAmount ? `${Number(contract.depositAmount).toLocaleString("fr-FR")} GNF` : "—"}
          </span>
          <span className="text-sub">Date de début</span>
          <span className="text-ink">{new Date(contract.startDate).toLocaleDateString("fr-FR")}</span>
          <span className="text-sub">Jour d&apos;échéance</span>
          <span className="text-ink">Le {contract.dueDay} du mois</span>
          {legal && (
            <>
              <span className="text-sub">Préavis requis</span>
              <span className="text-ink">{legal.noticePeriodDays} jours</span>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold text-sub uppercase flex items-center gap-1.5">
            <ShieldIcon className="w-3.5 h-3.5" />
            Garants ({contract.guarantors.length})
          </h2>
          <button
            onClick={() => setShowGuarantorModal(true)}
            className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline"
          >
            <PlusIcon className="w-3 h-3" />
            Ajouter un garant
          </button>
        </div>

        <Modal open={showGuarantorModal} onClose={() => setShowGuarantorModal(false)} title="Ajouter un garant">
          <form onSubmit={handleAddGuarantor} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nom complet"
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Téléphone"
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="Lien (ex. sœur)"
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
              <input
                type="number"
                value={guaranteedAmount}
                onChange={(e) => setGuaranteedAmount(e.target.value)}
                placeholder="Montant garanti (GNF)"
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
            {formError && <p className="text-sm text-critical">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
            >
              {saving ? "Ajout…" : "Ajouter le garant"}
            </button>
          </form>
        </Modal>

        {contract.guarantors.length === 0 ? (
          <p className="text-sm text-sub">Aucun garant enregistré.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {contract.guarantors.map((g) => (
              <div key={g.id} className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 border-t border-paper-2 pt-2.5 first:border-0 first:pt-0">
                <div>
                  <p className="text-sm font-semibold text-ink">{g.fullName}</p>
                  <p className="text-xs text-sub">
                    {g.relationship ?? "—"} {g.phone ? `· ${g.phone}` : ""}
                  </p>
                </div>
                {g.guaranteedAmount && (
                  <span className="text-sm font-mono text-ink">
                    {Number(g.guaranteedAmount).toLocaleString("fr-FR")} GNF
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-white p-5 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold text-sub uppercase flex items-center gap-1.5">
            <CardIcon className="w-3.5 h-3.5" />
            Facturation ({invoices.length})
          </h2>
          {contract.status === "active" && (
            <button
              onClick={handleGenerateInvoice}
              disabled={generating}
              className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline disabled:opacity-60"
            >
              <PlusIcon className="w-3 h-3" />
              {generating ? "Génération…" : "Générer la prochaine facture"}
            </button>
          )}
        </div>

        {invoiceError && <p className="text-sm text-critical mb-2">{invoiceError}</p>}

        {invoices.length === 0 ? (
          <p className="text-sm text-sub">Aucune facture pour ce contrat.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => {
              const s = INVOICE_STATUS_LABEL[inv.status];
              return (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 border-t border-paper-2 pt-2.5 first:border-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {new Date(inv.periodStart).toLocaleDateString("fr-FR")} –{" "}
                      {new Date(inv.periodEnd).toLocaleDateString("fr-FR")}
                    </p>
                    <p className="text-xs text-sub">
                      Échéance le {new Date(inv.dueDate).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-ink">
                      {Number(inv.amount).toLocaleString("fr-FR")} GNF
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
                      {s.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <DocumentsPanel relatedType="contract" relatedId={contract.id} />
      </div>

      {contract.status === "active" && (
        <button
          onClick={() => setShowTerminateModal(true)}
          className="mt-4 text-sm font-semibold text-critical hover:underline"
        >
          Résilier le contrat
        </button>
      )}

      <Modal open={showTerminateModal} onClose={() => setShowTerminateModal(false)} title="Résilier le contrat">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-sub">
            Le local redeviendra disponible. Un motif de résiliation est requis (A12, cahier des charges).
          </p>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Motif</label>
            <select
              value={terminationReason}
              onChange={(e) => setTerminationReason(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {(legal?.terminationReasons ?? []).map((code) => (
                <option key={code} value={code}>
                  {reasonLabel(code)}
                </option>
              ))}
            </select>
          </div>
          {terminateError && <p className="text-sm text-critical">{terminateError}</p>}
          <button
            type="button"
            onClick={handleConfirmTerminate}
            disabled={terminating || !terminationReason}
            className="rounded-lg bg-critical text-white text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition disabled:opacity-60"
          >
            {terminating ? "Résiliation…" : "Confirmer la résiliation"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
