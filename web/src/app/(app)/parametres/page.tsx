"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, getLegalSettings, updateLegalSettings, type LegalSettings } from "@/lib/api";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { reasonLabel } from "@/lib/legalReasons";

export default function LegalSettingsPage() {
  const [settings, setSettings] = useState<LegalSettings | null>(null);
  const [noticePeriodDays, setNoticePeriodDays] = useState("90");
  const [depositCapMonths, setDepositCapMonths] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [newReason, setNewReason] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLegalSettings()
      .then((s) => {
        setSettings(s);
        setNoticePeriodDays(String(s.noticePeriodDays));
        setDepositCapMonths(s.depositCapMonths !== null ? String(s.depositCapMonths) : "");
        setReasons(s.terminationReasons);
      })
      .catch(() => setError("Impossible de charger les paramètres."));
  }, []);

  function addReason() {
    const code = newReason.trim().toLowerCase().replace(/\s+/g, "_");
    if (!code || reasons.includes(code)) return;
    setReasons([...reasons, code]);
    setNewReason("");
  }

  function removeReason(code: string) {
    setReasons(reasons.filter((r) => r !== code));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      if (reasons.length === 0) {
        throw new ApiError("invalid_input", "Au moins un motif de résiliation est requis.");
      }
      const saved = await updateLegalSettings({
        noticePeriodDays: Number(noticePeriodDays),
        depositCapMonths: depositCapMonths ? Number(depositCapMonths) : null,
        terminationReasons: reasons,
      });
      setSettings(saved);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !error) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="text-xl font-semibold text-ink mb-1">Paramètres</h1>
      <p className="text-sm text-sub mb-6">
        Conformité légale locale (A12) — valeurs par défaut à valider avec un juriste guinéen avant la mise en
        production ; jamais codées en dur, toujours configurables ici par organisation.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Préavis requis (jours)</label>
          <input
            type="number"
            min={0}
            max={365}
            value={noticePeriodDays}
            onChange={(e) => setNoticePeriodDays(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          />
          <p className="text-xs text-sub mt-1">Délai de préavis affiché sur la fiche contrat.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">
            Plafond de caution (mois de loyer, optionnel)
          </label>
          <input
            type="number"
            min={0}
            max={12}
            step="0.5"
            placeholder="Aucun plafond"
            value={depositCapMonths}
            onChange={(e) => setDepositCapMonths(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          />
          <p className="text-xs text-sub mt-1">
            Au-delà, la création d&apos;un contrat avec une caution supérieure est refusée.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Motifs de résiliation autorisés</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {reasons.map((code) => (
              <span
                key={code}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-laterite-tint text-laterite"
              >
                {reasonLabel(code)}
                <button type="button" onClick={() => removeReason(code)} aria-label={`Retirer ${code}`}>
                  <CloseIcon className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addReason();
                }
              }}
              placeholder="Ajouter un motif"
              className="flex-1 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
            <button
              type="button"
              onClick={addReason}
              className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-paper-2 transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Ajouter
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-critical-tint text-critical text-sm px-3.5 py-2.5">{error}</div>}
        {success && (
          <div className="rounded-lg bg-success-tint text-success text-sm px-3.5 py-2.5">Paramètres enregistrés.</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
