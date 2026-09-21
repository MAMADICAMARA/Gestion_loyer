import type { Request } from "express";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Pagination non négociable dès le MVP sur les listes principales (cahier
// des charges, B5) — bornée à MAX_PAGE_SIZE pour qu'aucun client ne puisse
// forcer un dump complet d'une table en gonflant ?pageSize.
export function parsePagination(req: Request): PaginationParams {
  const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(Number(req.query.pageSize)) || DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(data: T[], total: number, { page, pageSize }: PaginationParams): Paginated<T> {
  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
