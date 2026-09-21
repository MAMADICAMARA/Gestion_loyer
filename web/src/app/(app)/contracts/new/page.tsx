"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createContract,
  getProperty,
  listProperties,
  listTenants,
  type Property,
  type Tenant,
  type Unit,
} from "@/lib/api";

export default function NewContractPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [tenantId, setTenantId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rentAmount, setRentAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [dueDay, setDueDay] = useState("5");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Champs de sélection : on veut tout le portefeuille, pas une page —
    // cf. B5, pageSize max pour rester dans les mêmes garde-fous que les
    // listes paginées plutôt que d'appeler l'API sans limite.
    listTenants({ pageSize: 100 }).then((res) => {
      setTenants(res.data);
      if (res.data.length) setTenantId(res.data[0].id);
    });
    listProperties({ pageSize: 100 }).then((res) => {
      setProperties(res.data);
      if (res.data.length) setPropertyId(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    getProperty(propertyId).then((p) => {
      const available = p.units.filter((u) => u.status === "available");
      setUnits(available);
      if (available.length) {
        setUnitId(available[0].id);
        setRentAmount(available[0].rentAmount);
        setDepositAmount(available[0].depositAmount ?? "");
      } else {
        setUnitId("");
        setRentAmount("");
        setDepositAmount("");
      }
    });
  }, [propertyId]);

  function handleUnitChange(id: string) {
    setUnitId(id);
    const unit = units.find((u) => u.id === id);
    if (unit) {
      setRentAmount(unit.rentAmount);
      setDepositAmount(unit.depositAmount ?? "");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!tenantId || !unitId) {
        throw new ApiError("invalid_input", "Sélectionnez un locataire et un local disponible.");
      }
      const contract = await createContract({
        unitId,
        tenantId,
        startDate,
        rentAmount: Number(rentAmount),
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
        dueDay: Number(dueDay),
      });
      router.push(`/contracts/${contract.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  const noTenants = tenants.length === 0;
  const noAvailableUnits = propertyId && units.length === 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="text-xl font-semibold text-ink mb-6">Nouveau contrat</h1>

      {noTenants && (
        <p className="text-sm text-warning bg-warning-tint rounded-lg px-3.5 py-2.5 mb-4">
          Aucun locataire enregistré — créez-en un d&apos;abord.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Locataire</label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Propriété</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Local disponible</label>
            <select
              value={unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              disabled={units.length === 0}
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20 disabled:bg-paper-2"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.number} · {u.unitType}
                </option>
              ))}
            </select>
          </div>
        </div>

        {noAvailableUnits && (
          <p className="text-sm text-warning bg-warning-tint rounded-lg px-3.5 py-2.5">
            Aucun local disponible dans cette propriété.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Loyer (GNF)</label>
            <input
              type="number"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Jour d&apos;échéance</label>
            <input
              type="number"
              min={1}
              max={28}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Caution (GNF)</label>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="w-48 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          />
        </div>

        {error && <div className="rounded-lg bg-critical-tint text-critical text-sm px-3.5 py-2.5">{error}</div>}

        <button
          type="submit"
          disabled={loading || noTenants || !unitId}
          className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
        >
          {loading ? "Création…" : "Créer le contrat"}
        </button>
      </form>
    </div>
  );
}
