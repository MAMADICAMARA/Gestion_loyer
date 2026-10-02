import { Router } from "express";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";

export const activityLogsRouter = Router();

// GET /api/activity-logs — réservé owner/admin (requireRole monté dans
// index.ts, comme pour /api/users). Écriture seule côté app : aucune route
// PATCH/DELETE n'existe sur cette ressource, conformément au cahier des
// charges ("jamais modifiable ni supprimable").
activityLogsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);

    const [total, logs] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.activityLog.count(),
        tx.activityLog.findMany({
          include: { user: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ])
    );

    res.json(paginate(logs, total, pagination));
  })
);
