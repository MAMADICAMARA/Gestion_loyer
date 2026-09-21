"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createTenant } from "@/lib/api";

const ID_DOC_TYPES = ["CNI", "Passeport", "Carte de résident", "Autre"];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-sub mb-1.5">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
      />
    </div>
  );
}

export default function NewTenantPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [address, setAddress] = useState("");
  const [idDocType, setIdDocType] = useState(ID_DOC_TYPES[0]);
  const [idDocNumber, setIdDocNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tenant = await createTenant({
        firstName,
        lastName,
        phone: phone || undefined,
        email: email || undefined,
        profession: profession || undefined,
        address: address || undefined,
        idDocType: idDocNumber ? idDocType : undefined,
        idDocNumber: idDocNumber || undefined,
        emergencyContact: emergencyContact || undefined,
      });
      router.push(`/tenants/${tenant.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl">
      <h1 className="text-xl font-semibold text-ink mb-6">Ajouter un locataire</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Prénom" value={firstName} onChange={setFirstName} placeholder="Aïssatou" required />
          <Field label="Nom" value={lastName} onChange={setLastName} placeholder="Camara" required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="+224 6XX XX XX XX" />
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="optionnel" />
        </div>

        <Field label="Profession" value={profession} onChange={setProfession} />
        <Field label="Adresse" value={address} onChange={setAddress} />

        <div>
          <label className="block text-xs font-semibold text-sub mb-1.5">Pièce d&apos;identité</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={idDocType}
              onChange={(e) => setIdDocType(e.target.value)}
              className="rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {ID_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={idDocNumber}
              onChange={(e) => setIdDocNumber(e.target.value)}
              placeholder="Numéro"
              className="rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
        </div>

        <Field
          label="Contact d'urgence"
          value={emergencyContact}
          onChange={setEmergencyContact}
          placeholder="Nom et téléphone"
        />

        {error && <div className="rounded-lg bg-critical-tint text-critical text-sm px-3.5 py-2.5">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
        >
          {loading ? "Création…" : "Créer le locataire"}
        </button>
      </form>
    </div>
  );
}
