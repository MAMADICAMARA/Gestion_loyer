"use client";

import { useEffect, useState } from "react";
import { listPortalPayouts, type OwnerPayout } from "@/lib/api";

const STATUS_LABEL: Record<OwnerPayout["status"], { label: string; className: string }> = {
  pending: { label: "À verser", className: "bg-warning-tint text-warning" },
  paid: { label: "Versé", className: "bg-success-tint text-success" },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("fr-FR");
}

export default function PortalPayoutsPage() {
  const [payouts, setPayouts] = useState<OwnerPayout[] | null>(null);

  useEffect(() => {
    listPortalPayouts().then(setPayouts);
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink">Versements</h1>
      <p className="text-sm text-sub mt-1">
        {payouts ? `${payouts.length} versement${payouts.length > 1 ? "s" : ""}` : "Chargement…"}
      </p>

      {payouts && payouts.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 mt-6 text-center text-sm text-sub">
          Aucun versement pour l&apos;instant.
        </div>
      )}

      {payouts && payouts.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto mt-6">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Période</th>
                <th className="px-4 py-2.5 font-semibold">Brut</th>
                <th className="px-4 py-2.5 font-semibold">Commission</th>
                <th className="px-4 py-2.5 font-semibold">Net</th>
                <th className="px-4 py-2.5 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => {
                const s = STATUS_LABEL[p.status];
                return (
                  <tr key={p.id} className="border-t border-paper-2">
                    <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">
                      {new Date(p.periodStart).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-mono text-sub whitespace-nowrap">{fmt(p.grossRentCollected)}</td>
                    <td className="px-4 py-3 font-mono text-laterite whitespace-nowrap">
                      −{fmt(p.commissionAmount)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-ink whitespace-nowrap">
                      {fmt(p.netAmount)} GNF
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.className}`}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
