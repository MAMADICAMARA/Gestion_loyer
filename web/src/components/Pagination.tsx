import { ChevronRightIcon } from "@/components/icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 mt-4 px-1">
      <p className="text-xs text-sub">
        Page {page} sur {totalPages} · {total} au total
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-paper-2 transition"
        >
          <ChevronRightIcon className="w-3.5 h-3.5 rotate-180" />
          Précédent
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-paper-2 transition"
        >
          Suivant
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
