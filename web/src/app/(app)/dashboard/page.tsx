"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function fmt(n: string | number) {
  return Number(n).toLocaleString("fr-FR");
}

function RevenueChart({ data }: { data: DashboardSummary["monthlyRevenue"] }) {
  const values = data.map((d) => Number(d.total));
  const max = Math.max(...values, 1);
  const width = 560;
  const height = 180;
  const marginLeft = 44;
  const marginBottom = 22;
  const plotW = width - marginLeft - 10;
  const plotH = height - marginBottom - 10;
  const slot = plotW / data.length;
  const barW = slot * 0.55;

  const niceMax = Math.ceil(max / 100000) * 100000 || 100000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {ticks.map((t) => {
        const y = 10 + plotH - (t / niceMax) * plotH;
        return (
          <g key={t}>
            <line x1={marginLeft} x2={width - 10} y1={y} y2={y} stroke="var(--paper-2)" strokeWidth={1} />
            <text x={marginLeft - 6} y={y + 3} textAnchor="end" fontSize={8} fill="var(--sub)" fontFamily="var(--font-mono)">
              {t >= 1000000 ? `${(t / 1000000).toFixed(1)}M` : `${Math.round(t / 1000)}k`}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const v = Number(d.total);
        const h = niceMax > 0 ? (v / niceMax) * plotH : 0;
        const x = marginLeft + i * slot + (slot - barW) / 2;
        const y = 10 + plotH - h;
        const isLast = i === data.length - 1;
        const [, monthNum] = d.month.split("-");
        const label = MONTHS_FR[Number(monthNum) - 1];
        return (
          <g key={d.month}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, v > 0 ? 2 : 0)}
              rx={2}
              fill={isLast ? "var(--laterite)" : "var(--indigo)"}
              opacity={isLast ? 1 : 0.75}
            />
            <text
              x={x + barW / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={8.5}
              fill={isLast ? "var(--laterite)" : "var(--sub)"}
              fontWeight={isLast ? 700 : 400}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const { me } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setError("Impossible de charger le tableau de bord."));
  }, []);

  const occupancyRate =
    summary && summary.unitsTotal > 0
      ? Math.round((summary.unitsOccupied / summary.unitsTotal) * 100)
      : 0;

  // "Rapports financiers" (matrice de permissions, Partie 2) : ❌ pour
  // agent — l'API renvoie ces champs à null plutôt que de les omettre,
  // pour que la garde soit explicite ici plutôt que dispersée.
  const canSeeFinancials = summary?.revenueThisMonth !== null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink">Bonjour {me.email.split("@")[0]}</h1>
      <p className="text-sm text-sub mt-1">{me.organization.name}</p>

      {error && <p className="text-sm text-critical mt-4">{error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
            {canSeeFinancials && (
              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-semibold text-sub uppercase">Revenus — ce mois</p>
                <p className="text-lg font-mono font-semibold text-ink mt-2">
                  {fmt(summary.revenueThisMonth!)} <span className="text-xs text-sub">GNF</span>
                </p>
              </div>
            )}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs font-semibold text-sub uppercase">Taux d&apos;occupation</p>
              <p className="text-lg font-mono font-semibold text-ink mt-2">{occupancyRate}%</p>
              <p className="text-xs text-sub mt-1">
                {summary.unitsOccupied} / {summary.unitsTotal} locaux
              </p>
            </div>
            {canSeeFinancials ? (
              <div
                className={`rounded-xl border p-4 ${
                  summary.overdueCount > 0 ? "bg-critical-tint border-critical/30" : "bg-white border-line"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase ${
                    summary.overdueCount > 0 ? "text-critical" : "text-sub"
                  }`}
                >
                  Impayés
                </p>
                <p
                  className={`text-lg font-mono font-semibold mt-2 ${
                    summary.overdueCount > 0 ? "text-critical" : "text-ink"
                  }`}
                >
                  {fmt(summary.outstandingAmount!)} <span className="text-xs">GNF</span>
                </p>
                {summary.overdueCount > 0 && (
                  <p className="text-xs text-critical mt-1">{summary.overdueCount} facture(s) en retard</p>
                )}
              </div>
            ) : (
              <div
                className={`rounded-xl border p-4 ${
                  summary.overdueCount > 0 ? "bg-critical-tint border-critical/30" : "bg-white border-line"
                }`}
              >
                <p className={`text-xs font-semibold uppercase ${summary.overdueCount > 0 ? "text-critical" : "text-sub"}`}>
                  Impayés
                </p>
                <p className={`text-lg font-mono font-semibold mt-2 ${summary.overdueCount > 0 ? "text-critical" : "text-ink"}`}>
                  {summary.overdueCount} facture{summary.overdueCount > 1 ? "s" : ""}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs font-semibold text-sub uppercase">Contrats actifs</p>
              <p className="text-lg font-mono font-semibold text-ink mt-2">{summary.activeContracts}</p>
              <p className="text-xs text-sub mt-1">{summary.propertiesTotal} propriété(s)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {canSeeFinancials && (
              <div className="lg:col-span-2 rounded-xl border border-line bg-white p-5">
                <h2 className="text-xs font-bold text-sub uppercase mb-3">Encaissements — 6 derniers mois</h2>
                <RevenueChart data={summary.monthlyRevenue} />
              </div>
            )}
            <div className={`rounded-xl border border-line bg-white p-5 flex flex-col gap-3 ${canSeeFinancials ? "" : "lg:col-span-3"}`}>
              <h2 className="text-xs font-bold text-sub uppercase mb-1">Accès rapide</h2>
              <Link href="/properties/new" className="text-sm font-semibold text-indigo hover:underline">
                + Ajouter une propriété
              </Link>
              <Link href="/tenants/new" className="text-sm font-semibold text-indigo hover:underline">
                + Ajouter un locataire
              </Link>
              <Link href="/contracts/new" className="text-sm font-semibold text-indigo hover:underline">
                + Nouveau contrat
              </Link>
              {summary.overdueCount > 0 && (
                <Link href="/impayes" className="text-sm font-semibold text-critical hover:underline mt-2">
                  → Voir les impayés
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
