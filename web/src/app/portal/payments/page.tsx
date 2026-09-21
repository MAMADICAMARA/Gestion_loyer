"use client";

import { useEffect, useState } from "react";
import { listPortalPayments, type PortalPayment } from "@/lib/api";
import { Pagination } from "@/components/Pagination";

function fmt(n: string) {
  return Number(n).toLocaleString("fr-FR");
}

export default function PortalPaymentsPage() {
  const [payments, setPayments] = useState<PortalPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listPortalPayments({ page })
      .then((res) => {
        setPayments(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les paiements."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Paiements</h1>
        <p className="text-sm text-sub mt-1">
          {payments ? `${pagination.total} paiement${pagination.total > 1 ? "s" : ""} reçu${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
        </p>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {payments && payments.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucun paiement enregistré pour l&apos;instant.</p>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Locataire</th>
                <th className="px-4 py-2.5 font-semibold">Local</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Moyen</th>
                <th className="px-4 py-2.5 font-semibold">Montant</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-paper-2">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {p.contract.tenant.firstName} {p.contract.tenant.lastName}
                  </td>
                  <td className="px-4 py-3 text-sub">
                    {p.contract.unit.property.name} · {p.contract.unit.number}
                  </td>
                  <td className="px-4 py-3 font-mono text-ink">
                    {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-sub">{p.paymentMethod}</td>
                  <td className="px-4 py-3 font-mono text-ink font-semibold">{fmt(p.amount)} GNF</td>
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
