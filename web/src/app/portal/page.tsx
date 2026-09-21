"use client";

import { useEffect, useState } from "react";
import { getPortalMe, getPortalSummary, type PortalMe, type PortalSummary } from "@/lib/api";

function fmt(n: string | number) {
  return Number(n).toLocaleString("fr-FR");
}

export default function PortalHomePage() {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [summary, setSummary] = useState<PortalSummary | null>(null);

  useEffect(() => {
    getPortalMe().then(setMe);
    getPortalSummary().then(setSummary);
  }, []);

  if (!me || !summary) return <div className="p-4 sm:p-8 text-sm text-sub">Chargement…</div>;

  const payout = summary.latestPayout;
  const gross = payout ? Number(payout.grossRentCollected) : 0;
  const commission = payout ? Number(payout.commissionAmount) : 0;
  const net = payout ? Number(payout.netAmount) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink">Bonjour {me.fullName.split(" ")[0]}</h1>
      <p className="text-sm text-sub mt-1">
        {summary.propertiesCount} bien{summary.propertiesCount > 1 ? "s" : ""} · {me.properties.map((p) => p.name).join(", ")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs font-semibold text-sub uppercase">Loyers perçus — ce mois</p>
          <p className="text-lg font-mono font-semibold text-ink mt-2">
            {fmt(summary.grossThisMonth)} <span className="text-xs text-sub">GNF</span>
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs font-semibold text-sub uppercase">Commission agence</p>
          <p className="text-lg font-mono font-semibold text-laterite mt-2">
            −{fmt(commission)} <span className="text-xs text-sub">GNF</span>
          </p>
        </div>
        <div className="rounded-xl border border-success bg-success-tint p-4">
          <p className="text-xs font-semibold text-success uppercase">Net à recevoir</p>
          <p className="text-lg font-mono font-semibold text-success mt-2">
            {fmt(net)} <span className="text-xs">GNF</span>
          </p>
        </div>
      </div>

      {payout && gross > 0 && (
        <div className="rounded-xl border border-line bg-white p-5 mt-4">
          <h2 className="text-xs font-bold text-sub uppercase mb-3">
            Répartition —{" "}
            {new Date(payout.periodStart).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </h2>
          <div className="w-full h-5 rounded-full overflow-hidden flex bg-paper-2">
            <div className="bg-success h-full" style={{ width: `${(net / gross) * 100}%` }} />
            <div className="bg-laterite h-full" style={{ width: `${(commission / gross) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" />
              Net versé — {Math.round((net / gross) * 100)}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-laterite inline-block" />
              Commission — {Math.round((commission / gross) * 100)}%
            </span>
          </div>
        </div>
      )}

      {!payout && (
        <div className="rounded-xl border border-dashed border-line bg-white p-8 mt-4 text-center text-sm text-sub">
          Aucun versement pour l&apos;instant.
        </div>
      )}
    </div>
  );
}
