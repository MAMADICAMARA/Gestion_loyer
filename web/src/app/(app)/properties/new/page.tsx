"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createOwner, createProperty, listOwners, type Owner } from "@/lib/api";

const PROPERTY_TYPES = [
  { value: "immeuble", label: "Immeuble" },
  { value: "maison", label: "Maison" },
  { value: "villa", label: "Villa" },
  { value: "magasin", label: "Magasin / local commercial" },
  { value: "bureau", label: "Bureau" },
  { value: "autre", label: "Autre" },
];

export default function NewPropertyPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerMode, setOwnerMode] = useState<"existing" | "new">("existing");
  const [ownerId, setOwnerId] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");

  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0].value);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listOwners({ pageSize: 100 })
      .then((res) => {
        setOwners(res.data);
        if (res.data.length === 0) setOwnerMode("new");
        else setOwnerId(res.data[0].id);
      })
      .catch(() => setError("Impossible de charger les propriétaires."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let resolvedOwnerId = ownerId;
      if (ownerMode === "new") {
        if (!newOwnerName.trim()) throw new ApiError("invalid_input", "Le nom du propriétaire est requis.");
        const owner = await createOwner({ fullName: newOwnerName, phone: newOwnerPhone || undefined });
        resolvedOwnerId = owner.id;
      }
      if (!resolvedOwnerId) throw new ApiError("invalid_input", "Sélectionnez un propriétaire.");

      const property = await createProperty({
        ownerId: resolvedOwnerId,
        name,
        propertyType,
        city: city || undefined,
        district: district || undefined,
        address: address || undefined,
      });
      router.push(`/properties/${property.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="text-xl font-semibold text-ink mb-6">Ajouter une propriété</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Propriétaire</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setOwnerMode("existing")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                ownerMode === "existing" ? "bg-laterite-tint text-laterite border-laterite" : "border-line text-sub"
              }`}
              disabled={owners.length === 0}
            >
              Existant
            </button>
            <button
              type="button"
              onClick={() => setOwnerMode("new")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                ownerMode === "new" ? "bg-laterite-tint text-laterite border-laterite" : "border-line text-sub"
              }`}
            >
              Nouveau propriétaire
            </button>
          </div>

          {ownerMode === "existing" ? (
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
                placeholder="Nom complet"
                className="flex-1 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
              <input
                value={newOwnerPhone}
                onChange={(e) => setNewOwnerPhone(e.target.value)}
                placeholder="Téléphone"
                className="sm:w-36 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Nom de la propriété</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Résidence Horizon"
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Type</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Ville</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Conakry"
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Quartier</label>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Kaloum"
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Adresse</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
          />
        </div>

        {error && <div className="rounded-lg bg-critical-tint text-critical text-sm px-3.5 py-2.5">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
        >
          {loading ? "Création…" : "Créer la propriété"}
        </button>
      </form>
    </div>
  );
}
