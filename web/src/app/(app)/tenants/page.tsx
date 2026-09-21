"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listTenants, type Tenant } from "@/lib/api";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listTenants({ page })
      .then((res) => {
        setTenants(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les locataires."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Locataires</h1>
          <p className="text-sm text-sub mt-1">
            {tenants ? `${pagination.total} locataire${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <Link
          href="/tenants/new"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition"
        >
          <PlusIcon className="w-4 h-4" />
          Ajouter un locataire
        </Link>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {tenants && tenants.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucun locataire pour l&apos;instant.</p>
          <Link href="/tenants/new" className="text-sm font-semibold text-indigo hover:underline mt-2 inline-block">
            Ajouter le premier
          </Link>
        </div>
      )}

      {tenants && tenants.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Nom</th>
                <th className="px-4 py-2.5 font-semibold">Téléphone</th>
                <th className="px-4 py-2.5 font-semibold">Profession</th>
                <th className="px-4 py-2.5 font-semibold">Pièce d&apos;identité</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-paper-2 hover:bg-paper-2/50 transition">
                  <td className="px-4 py-3">
                    <Link href={`/tenants/${tenant.id}`} className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-indigo-tint text-indigo flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {tenant.firstName[0]}
                        {tenant.lastName[0]}
                      </span>
                      <span className="font-semibold text-ink">
                        {tenant.firstName} {tenant.lastName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sub font-mono">{tenant.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-sub">{tenant.profession ?? "—"}</td>
                  <td className="px-4 py-3 text-sub">
                    {tenant.idDocType && tenant.idDocNumber
                      ? `${tenant.idDocType} · ${tenant.idDocNumber}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
    </div>
  );
}
