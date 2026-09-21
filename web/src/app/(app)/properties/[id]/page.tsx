"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { ApiError, createUnit, getProperty, type PropertyDetail, type UnitStatus } from "@/lib/api";
import { PinIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";

const UNIT_STATUS_LABEL: Record<UnitStatus, { label: string; className: string }> = {
  available: { label: "Disponible", className: "bg-indigo-tint text-indigo" },
  reserved: { label: "Réservé", className: "bg-warning-tint text-warning" },
  occupied: { label: "Occupé", className: "bg-success-tint text-success" },
  maintenance: { label: "Maintenance", className: "bg-paper-2 text-sub" },
  out_of_service: { label: "Hors service", className: "bg-critical-tint text-critical" },
};

const UNIT_TYPES = ["chambre", "studio", "magasin", "bureau", "autre"];

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [number, setNumber] = useState("");
  const [unitType, setUnitType] = useState(UNIT_TYPES[0]);
  const [rentAmount, setRentAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    getProperty(params.id)
      .then(setProperty)
      .catch(() => setError("Propriété introuvable."));
  }

  useEffect(reload, [params.id]);

  async function handleAddUnit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!number.trim() || !rentAmount) {
        throw new ApiError("invalid_input", "Numéro et loyer sont requis.");
      }
      await createUnit(params.id, {
        number,
        unitType,
        rentAmount: Number(rentAmount),
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
      });
      setNumber("");
      setRentAmount("");
      setDepositAmount("");
      setShowModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p-4 sm:p-8 text-sm text-critical">{error}</div>;
  if (!property) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="text-xl font-semibold text-ink">{property.name}</h1>
      <p className="text-sm text-sub mt-1 flex items-center gap-1 flex-wrap">
        <PinIcon className="w-3.5 h-3.5 shrink-0" />
        {property.city ?? "—"}
        {property.district ? `, ${property.district}` : ""} · Propriétaire{" "}
        <span className="font-semibold text-ink">{property.owner.fullName}</span>
      </p>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="text-sm font-bold text-ink">Locaux ({property.units.length})</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-white text-sm font-semibold text-ink px-3 py-1.5 hover:bg-paper-2 transition"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Ajouter un local
        </button>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Ajouter un local">
        <form onSubmit={handleAddUnit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Numéro (M-001)"
              className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              placeholder="Loyer (GNF)"
              type="number"
              className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Caution (GNF, optionnel)"
              type="number"
              className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          {formError && <p className="text-sm text-critical">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
          >
            {saving ? "Ajout…" : "Ajouter le local"}
          </button>
        </form>
      </Modal>

      {property.units.length === 0 ? (
        <p className="text-sm text-sub">Aucun local pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase border-b border-line">
                <th className="pb-2 font-semibold">Local</th>
                <th className="pb-2 font-semibold">Type</th>
                <th className="pb-2 font-semibold">Loyer</th>
                <th className="pb-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {property.units.map((unit) => {
                const statusInfo = UNIT_STATUS_LABEL[unit.status];
                return (
                  <tr key={unit.id} className="border-b border-paper-2">
                    <td className="py-2.5 font-semibold text-ink">{unit.number}</td>
                    <td className="py-2.5 text-sub">{unit.unitType}</td>
                    <td className="py-2.5 font-mono text-ink whitespace-nowrap">
                      {Number(unit.rentAmount).toLocaleString("fr-FR")} GNF
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
