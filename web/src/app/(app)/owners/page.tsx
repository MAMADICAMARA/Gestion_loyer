"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listOwners, type Owner } from "@/lib/api";
import { Pagination } from "@/components/Pagination";

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listOwners({ page })
      .then((res) => {
        setOwners(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les propriétaires."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Propriétaires</h1>
        <p className="text-sm text-sub mt-1">
          {owners ? `${pagination.total} propriétaire${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
        </p>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {owners && owners.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">
            Aucun propriétaire pour l&apos;instant — ils sont créés depuis le formulaire d&apos;ajout de propriété.
          </p>
        </div>
      )}

      {owners && owners.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Nom</th>
                <th className="px-4 py-2.5 font-semibold">Téléphone</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner) => (
                <tr key={owner.id} className="border-t border-paper-2 hover:bg-paper-2/50 transition">
                  <td className="px-4 py-3">
                    <Link href={`/owners/${owner.id}`} className="font-semibold text-ink">
                      {owner.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sub font-mono">{owner.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-sub">{owner.email ?? "—"}</td>
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
