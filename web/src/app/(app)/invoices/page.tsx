"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listInvoices, type Invoice, type InvoiceStatus } from "@/lib/api";
import { Pagination } from "@/components/Pagination";

const STATUS_LABEL: Record<InvoiceStatus, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-indigo-tint text-indigo" },
  partially_paid: { label: "Partielle", className: "bg-warning-tint text-warning" },
  paid: { label: "Payée", className: "bg-success-tint text-success" },
  overdue: { label: "En retard", className: "bg-critical-tint text-critical" },
  cancelled: { label: "Annulée", className: "bg-paper-2 text-sub" },
};

function fmt(n: string) {
  return Number(n).toLocaleString("fr-FR");
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listInvoices({ page })
      .then((res) => {
        setInvoices(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les factures."));
  }, [page]);

  // Sur cette seule page (les impayés du portefeuille entier sont visibles
  // via /impayes, qui interroge séparément) — cf. B5, pagination des listes.
  const overdueCount = invoices?.filter((i) => i.status === "overdue").length ?? 0;
  const overdueTotal =
    invoices
      ?.filter((i) => i.status === "overdue")
      .reduce((s, i) => s + Number(i.amount) + Number(i.lateFeeAmount), 0) ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Facturation</h1>
        <p className="text-sm text-sub mt-1">
          {invoices ? `${pagination.total} facture${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
          {overdueCount > 0 && (
            <span className="text-critical font-semibold"> · {overdueCount} en retard ({fmt(String(overdueTotal))} GNF)</span>
          )}
        </p>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {invoices && invoices.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">
            Aucune facture pour l&apos;instant — générez-en une depuis la fiche d&apos;un contrat actif.
          </p>
        </div>
      )}

      {invoices && invoices.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Locataire</th>
                <th className="px-4 py-2.5 font-semibold">Local</th>
                <th className="px-4 py-2.5 font-semibold">Échéance</th>
                <th className="px-4 py-2.5 font-semibold">Montant</th>
                <th className="px-4 py-2.5 font-semibold">Pénalité</th>
                <th className="px-4 py-2.5 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = STATUS_LABEL[inv.status];
                return (
                  <tr key={inv.id} className="border-t border-paper-2 hover:bg-paper-2/50 transition">
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-semibold text-ink">
                        {inv.contract.tenant.firstName} {inv.contract.tenant.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sub">
                      {inv.contract.unit.property.name} · {inv.contract.unit.number}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {new Date(inv.dueDate).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">{fmt(inv.amount)} GNF</td>
                    <td className="px-4 py-3 font-mono">
                      {Number(inv.lateFeeAmount) > 0 ? (
                        <span className="text-critical">+{fmt(inv.lateFeeAmount)}</span>
                      ) : (
                        <span className="text-sub">—</span>
                      )}
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
