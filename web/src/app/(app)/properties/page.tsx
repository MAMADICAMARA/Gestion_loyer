"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProperties, type Property } from "@/lib/api";
import { PinIcon, PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    listProperties({ page })
      .then((res) => {
        setProperties(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger les propriétés."));
  }, [page]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Propriétés</h1>
          <p className="text-sm text-sub mt-1">
            {properties ? `${pagination.total} propriété${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <Link
          href="/properties/new"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition"
        >
          <PlusIcon className="w-4 h-4" />
          Ajouter un bien
        </Link>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {properties && properties.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="text-sm text-sub">Aucune propriété pour l&apos;instant.</p>
          <Link href="/properties/new" className="text-sm font-semibold text-indigo hover:underline mt-2 inline-block">
            Ajouter la première
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties?.map((property) => (
          <Link
            key={property.id}
            href={`/properties/${property.id}`}
            className="rounded-xl border border-line bg-white overflow-hidden hover:shadow-md transition"
          >
            <div className="h-20 bg-gradient-to-br from-laterite to-laterite-dark" />
            <div className="p-4">
              <h3 className="text-sm font-bold text-ink">{property.name}</h3>
              <p className="text-xs text-sub mt-1 flex items-center gap-1">
                <PinIcon className="w-3 h-3" />
                {property.city ?? "—"}
                {property.district ? `, ${property.district}` : ""}
              </p>
              <div className="flex justify-between mt-4 pt-3 border-t border-paper-2">
                <div className="text-center">
                  <p className="text-sm font-mono font-semibold text-ink">{property.unitsTotal}</p>
                  <p className="text-[10px] text-sub uppercase">Locaux</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-mono font-semibold text-ink">{property.unitsOccupied}</p>
                  <p className="text-[10px] text-sub uppercase">Occupés</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-mono font-semibold text-success">
                    {property.unitsTotal > 0
                      ? Math.round((property.unitsOccupied / property.unitsTotal) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-[10px] text-sub uppercase">Taux</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
    </div>
  );
}
