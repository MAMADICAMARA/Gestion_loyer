"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  ApiError,
  createPortalAccess,
  generatePayout,
  getOwner,
  listOwnerPayouts,
  markPayoutPaid,
  setCommissionRule,
  type OwnerDetail,
  type OwnerPayout,
} from "@/lib/api";
import { Modal } from "@/components/Modal";
import { PlusIcon, ShieldIcon } from "@/components/icons";

function fmt(n: string | number) {
  return Number(n).toLocaleString("fr-FR");
}

const PAYOUT_STATUS_LABEL: Record<OwnerPayout["status"], { label: string; className: string }> = {
  pending: { label: "À verser", className: "bg-warning-tint text-warning" },
  paid: { label: "Versé", className: "bg-success-tint text-success" },
};

export default function OwnerDetailPage() {
  const params = useParams<{ id: string }>();
  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showRateModal, setShowRateModal] = useState(false);
  const [rate, setRate] = useState("10");
  const [rateError, setRateError] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessCreated, setAccessCreated] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  function reload() {
    getOwner(params.id)
      .then((o) => {
        setOwner(o);
        setRate(o.commissionRule ? o.commissionRule.ratePercentage : "10");
      })
      .catch(() => setError("Propriétaire introuvable."));
    listOwnerPayouts(params.id).then(setPayouts);
  }

  useEffect(reload, [params.id]);

  async function handleSetRate(e: FormEvent) {
    e.preventDefault();
    setRateError(null);
    setSavingRate(true);
    try {
      await setCommissionRule(params.id, { ratePercentage: Number(rate) });
      setShowRateModal(false);
      reload();
    } catch (err) {
      setRateError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSavingRate(false);
    }
  }

  async function handleCreateAccess(e: FormEvent) {
    e.preventDefault();
    setAccessError(null);
    setSavingAccess(true);
    try {
      await createPortalAccess(params.id, { email: accessEmail, password: accessPassword });
      setAccessCreated(true);
      reload();
    } catch (err) {
      setAccessError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSavingAccess(false);
    }
  }

  async function handleGeneratePayout() {
    setPayoutError(null);
    setGenerating(true);
    try {
      await generatePayout(params.id);
      listOwnerPayouts(params.id).then(setPayouts);
    } catch (err) {
      setPayoutError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleMarkPaid(payoutId: string) {
    await markPayoutPaid(payoutId);
    listOwnerPayouts(params.id).then(setPayouts);
  }

  if (error) return <div className="p-4 sm:p-8 text-sm text-critical">{error}</div>;
  if (!owner) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-ink">{owner.fullName}</h1>
      <p className="text-sm text-sub mt-1">
        {owner.phone ?? "—"} {owner.email ? `· ${owner.email}` : ""} · {owner.properties.length} bien
        {owner.properties.length > 1 ? "s" : ""}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold text-sub uppercase mb-2">Commission d&apos;agence</h2>
          {owner.commissionRule ? (
            <p className="text-lg font-mono font-semibold text-ink">
              {owner.commissionRule.ratePercentage}%{" "}
              <span className="text-xs text-sub font-sans font-normal">
                du loyer {owner.commissionRule.calculationBase === "gross" ? "brut" : "net"}
              </span>
            </p>
          ) : (
            <p className="text-sm text-sub">Aucun taux défini.</p>
          )}
          <button
            onClick={() => setShowRateModal(true)}
            className="mt-2 text-xs font-semibold text-indigo hover:underline"
          >
            {owner.commissionRule ? "Modifier le taux" : "Définir un taux"}
          </button>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold text-sub uppercase mb-2 flex items-center gap-1.5">
            <ShieldIcon className="w-3.5 h-3.5" />
            Portail propriétaire
          </h2>
          {owner.hasPortalAccess || accessCreated ? (
            <p className="text-sm text-success font-semibold">Accès activé</p>
          ) : (
            <>
              <p className="text-sm text-sub">Aucun accès portail.</p>
              <button
                onClick={() => setShowAccessModal(true)}
                className="mt-2 text-xs font-semibold text-indigo hover:underline"
              >
                Créer l&apos;accès
              </button>
            </>
          )}
        </div>
      </div>

      <Modal open={showRateModal} onClose={() => setShowRateModal(false)} title="Taux de commission">
        <form onSubmit={handleSetRate} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Taux (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          {rateError && <p className="text-sm text-critical">{rateError}</p>}
          <button
            type="submit"
            disabled={savingRate}
            className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
          >
            {savingRate ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </Modal>

      <Modal
        open={showAccessModal}
        onClose={() => setShowAccessModal(false)}
        title="Créer l'accès portail"
      >
        {accessCreated ? (
          <p className="text-sm text-success">Accès créé — communiquez ces identifiants au propriétaire.</p>
        ) : (
          <form onSubmit={handleCreateAccess} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-sub mb-1.5">Email de connexion</label>
              <input
                type="email"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sub mb-1.5">Mot de passe initial</label>
              <input
                type="text"
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
                placeholder="8 caractères minimum"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
            {accessError && <p className="text-sm text-critical">{accessError}</p>}
            <button
              type="submit"
              disabled={savingAccess}
              className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
            >
              {savingAccess ? "Création…" : "Créer l'accès"}
            </button>
          </form>
        )}
      </Modal>

      <div className="rounded-xl border border-line bg-white p-5 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold text-sub uppercase">Versements ({payouts.length})</h2>
          <button
            onClick={handleGeneratePayout}
            disabled={generating}
            className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline disabled:opacity-60"
          >
            <PlusIcon className="w-3 h-3" />
            {generating ? "Calcul…" : "Générer le versement du mois"}
          </button>
        </div>

        {payoutError && <p className="text-sm text-critical mb-2">{payoutError}</p>}

        {payouts.length === 0 ? (
          <p className="text-sm text-sub">Aucun versement pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payouts.map((p) => {
              const s = PAYOUT_STATUS_LABEL[p.status];
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 border-t border-paper-2 pt-2.5 first:border-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {new Date(p.periodStart).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </p>
                    <p className="text-xs text-sub">
                      Brut {fmt(p.grossRentCollected)} − Commission {fmt(p.commissionAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-ink">{fmt(p.netAmount)} GNF</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
                      {s.label}
                    </span>
                    {p.status === "pending" && (
                      <button
                        onClick={() => handleMarkPaid(p.id)}
                        className="text-xs font-semibold text-indigo hover:underline"
                      >
                        Marquer payé
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
