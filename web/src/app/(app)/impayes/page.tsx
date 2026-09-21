"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listInvoices, type Invoice } from "@/lib/api";

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR");
}

function daysLate(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

function remainingDue(inv: Invoice): number {
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  return Number(inv.amount) + Number(inv.lateFeeAmount) - paid;
}

const BUCKETS = [
  { key: "0-7", label: "0–7j", min: 0, max: 7, color: "var(--gold)" },
  { key: "8-15", label: "8–15j", min: 8, max: 15, color: "var(--warning)" },
  { key: "16-30", label: "16–30j", min: 16, max: 30, color: "var(--laterite)" },
  { key: "30+", label: "30j+", min: 31, max: Infinity, color: "var(--critical)" },
];

function severity(days: number): { label: string; className: string } {
  if (days <= 7) return { label: "Retard léger", className: "bg-gold-tint text-warning" };
  if (days <= 15) return { label: "Retard moyen", className: "bg-warning-tint text-warning" };
  return { label: "Retard important", className: "bg-critical-tint text-critical" };
}

export default function ImpayesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Vue agrégée (répartition par ancienneté) : on demande la plus grande
    // page possible plutôt que de paginer un graphique. Au-delà de 100
    // factures en retard simultanément, cette vue devra passer par un
    // vrai agrégat serveur — hors de portée du volume MVP visé.
    listInvoices({ pageSize: 100 })
      .then((res) => setInvoices(res.data))
      .catch(() => setError("Impossible de charger les impayés."));
  }, []);

  const late = useMemo(() => {
    if (!invoices) return [];
    return invoices
      .filter((inv) => inv.status !== "paid" && inv.status !== "cancelled" && daysLate(inv.dueDate) > 0)
      .map((inv) => ({ inv, days: daysLate(inv.dueDate), due: remainingDue(inv) }))
      .sort((a, b) => b.days - a.days);
  }, [invoices]);

  const bucketCounts = BUCKETS.map((b) => ({
    ...b,
    count: late.filter((l) => l.days >= b.min && l.days <= b.max).length,
  }));
  const maxCount = Math.max(...bucketCounts.map((b) => b.count), 1);
  const totalDue = late.reduce((s, l) => s + l.due, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Impayés</h1>
        <p className="text-sm text-sub mt-1">
          {invoices
            ? `${late.length} dossier${late.length > 1 ? "s" : ""} en retard · ${fmt(totalDue)} GNF`
            : "Chargement…"}
        </p>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {invoices && late.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucun impayé — tout est à jour.</p>
        </div>
      )}

      {late.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-white p-5 lg:max-w-none max-w-xs">
            <h2 className="text-xs font-bold text-sub uppercase mb-4">Par ancienneté</h2>
            <svg viewBox="0 0 220 150" className="w-full">
              {bucketCounts.map((b, i) => {
                const barW = 36;
                const gap = (220 - barW * 4) / 5;
                const x = gap + i * (barW + gap);
                const h = (b.count / maxCount) * 100;
                const y = 120 - h;
                return (
                  <g key={b.key}>
                    <rect x={x} y={y} width={barW} height={Math.max(h, b.count > 0 ? 3 : 0)} rx={3} fill={b.color} />
                    <text x={x + barW / 2} y={112 - h} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
                      {b.count > 0 ? b.count : ""}
                    </text>
                    <text x={x + barW / 2} y={134} textAnchor="middle" fontSize={9} fill="var(--sub)">
                      {b.label}
                    </text>
                  </g>
                );
              })}
              <line x1="0" y1="120" x2="220" y2="120" stroke="var(--line)" />
            </svg>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                  <th className="px-4 py-2.5 font-semibold">Locataire</th>
                  <th className="px-4 py-2.5 font-semibold">Retard</th>
                  <th className="px-4 py-2.5 font-semibold">Sévérité</th>
                  <th className="px-4 py-2.5 font-semibold">Solde dû</th>
                </tr>
              </thead>
              <tbody>
                {late.map(({ inv, days, due }) => {
                  const s = severity(days);
                  return (
                    <tr key={inv.id} className="border-t border-paper-2 hover:bg-paper-2/50 transition">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-semibold text-ink">
                          {inv.contract.tenant.firstName} {inv.contract.tenant.lastName}
                        </Link>
                        <p className="text-xs text-sub">
                          {inv.contract.unit.property.name} · {inv.contract.unit.number}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-critical font-semibold">J+{days}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink font-semibold">{fmt(due)} GNF</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
