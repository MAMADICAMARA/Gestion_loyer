"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getTenant, type Tenant } from "@/lib/api";
import { DocumentsPanel } from "@/components/DocumentsPanel";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-paper-2 last:border-0">
      <span className="text-sub">{label}</span>
      <span className="text-ink font-medium">{value || "—"}</span>
    </div>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTenant(params.id)
      .then(setTenant)
      .catch(() => setError("Locataire introuvable."));
  }, [params.id]);

  if (error) return <div className="p-4 sm:p-8 text-sm text-critical">{error}</div>;
  if (!tenant) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-tint text-indigo flex items-center justify-center text-lg font-bold flex-shrink-0">
          {tenant.firstName[0]}
          {tenant.lastName[0]}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {tenant.firstName} {tenant.lastName}
          </h1>
          <p className="text-sm text-sub">{tenant.profession ?? "Locataire"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold text-sub uppercase mb-2">Contact</h2>
          <Row label="Téléphone" value={tenant.phone} />
          <Row label="Email" value={tenant.email} />
          <Row label="Adresse" value={tenant.address} />
          <Row label="Contact d'urgence" value={tenant.emergencyContact} />
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-xs font-bold text-sub uppercase mb-2">Identité</h2>
          <Row label="Type de pièce" value={tenant.idDocType} />
          <Row label="Numéro" value={tenant.idDocNumber} />
          <Row
            label="Date de naissance"
            value={tenant.birthDate ? new Date(tenant.birthDate).toLocaleDateString("fr-FR") : null}
          />
        </div>
      </div>

      <div className="mt-4">
        <DocumentsPanel relatedType="tenant" relatedId={tenant.id} />
      </div>
    </div>
  );
}
