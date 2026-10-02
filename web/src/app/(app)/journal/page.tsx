"use client";

import { useEffect, useState } from "react";
import { listActivityLogs, type ActivityAction, type ActivityLog } from "@/lib/api";
import { Pagination } from "@/components/Pagination";

const ACTION_LABEL: Record<ActivityAction, { label: string; className: string }> = {
  create: { label: "Création", className: "bg-success-tint text-success" },
  update: { label: "Modification", className: "bg-warning-tint text-warning" },
  delete: { label: "Suppression", className: "bg-critical-tint text-critical" },
};

const ENTITY_LABEL: Record<string, string> = {
  owner: "Propriétaire",
  property: "Propriété",
  unit: "Local",
  tenant: "Locataire",
  contract: "Contrat",
  guarantor: "Garant",
  invoice: "Facture",
  payment: "Paiement",
  owner_payout: "Versement",
  commission_rule: "Commission",
  portal_access: "Accès portail",
  user: "Utilisateur",
};

function formatMetadata(metadata: ActivityLog["metadata"]): string {
  if (!metadata || Object.keys(metadata).length === 0) return "—";
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listActivityLogs({ page, pageSize: 50 })
      .then((res) => {
        setLogs(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger le journal d'activité."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Journal d&apos;activité</h1>
        <p className="text-sm text-sub mt-1">
          {logs ? `${pagination.total} évènement${pagination.total > 1 ? "s" : ""}` : "Chargement…"} — écriture
          seule, jamais modifiable ni supprimable.
        </p>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {logs && logs.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucune activité enregistrée pour l&apos;instant.</p>
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Utilisateur</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Détails</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const action = ACTION_LABEL[log.action];
                return (
                  <tr key={log.id} className="border-t border-paper-2">
                    <td className="px-4 py-3 text-sub font-mono whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-ink">{log.user?.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${action.className}`}>
                        {action.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{ENTITY_LABEL[log.entityType] ?? log.entityType}</td>
                    <td className="px-4 py-3 text-sub">{formatMetadata(log.metadata)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
    </div>
  );
}
