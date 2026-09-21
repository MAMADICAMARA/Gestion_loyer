"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listContracts, type Contract, type ContractStatus } from "@/lib/api";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";

const STATUS_LABEL: Record<ContractStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-paper-2 text-sub" },
  active: { label: "Actif", className: "bg-success-tint text-success" },
  suspended: { label: "Suspendu", className: "bg-warning-tint text-warning" },
  terminated: { label: "Résilié", className: "bg-critical-tint text-critical" },
  expired: { label: "Expiré", className: "bg-critical-tint text-critical" },
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listContracts({ page })
      .then((res) => {
        setContracts(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les contrats."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Contrats</h1>
          <p className="text-sm text-sub mt-1">
            {contracts ? `${pagination.total} contrat${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition"
        >
          <PlusIcon className="w-4 h-4" />
          Nouveau contrat
        </Link>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {contracts && contracts.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucun contrat pour l&apos;instant.</p>
          <Link href="/contracts/new" className="text-sm font-semibold text-indigo hover:underline mt-2 inline-block">
            Créer le premier
          </Link>
        </div>
      )}

      {contracts && contracts.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Locataire</th>
                <th className="px-4 py-2.5 font-semibold">Local</th>
                <th className="px-4 py-2.5 font-semibold">Loyer</th>
                <th className="px-4 py-2.5 font-semibold">Garant</th>
                <th className="px-4 py-2.5 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const status = STATUS_LABEL[c.status];
                return (
                  <tr key={c.id} className="border-t border-paper-2 hover:bg-paper-2/50 transition">
                    <td className="px-4 py-3">
                      <Link href={`/contracts/${c.id}`} className="font-semibold text-ink">
                        {c.tenant.firstName} {c.tenant.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sub">
                      {c.unit.property.name} · {c.unit.number}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {Number(c.rentAmount).toLocaleString("fr-FR")} GNF
                    </td>
                    <td className="px-4 py-3 text-sub">
                      {c.guarantors.length > 0 ? c.guarantors[0].fullName : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
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
