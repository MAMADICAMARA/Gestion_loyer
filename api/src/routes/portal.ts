import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";

export const portalRouter = Router();

/**
 * Résout le propriétaire représenté par le compte owner_viewer courant.
 * C'est la portée qui va au-delà de la RLS : la RLS isole par organisation,
 * mais un propriétaire ne doit voir QUE ses propres données, pas celles des
 * autres propriétaires de la même agence — ce filtre-là est nécessairement
 * applicatif (schema.sql §10, commentaire sur owner_payouts).
 */
const resolveOwnerScope = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const owner = await withOrgContext(req.auth!.organizationId, (tx) =>
    tx.owner.findFirst({ where: { userId: req.auth!.userId } })
  );
  if (!owner) {
    return res.status(403).json({ code: "no_owner_profile", message: "Aucun profil propriétaire associé à ce compte." });
  }
  req.ownerId = owner.id;
  next();
});

portalRouter.use(requireRole("owner_viewer"), resolveOwnerScope);

portalRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const owner = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.owner.findFirst({
        where: { id: req.ownerId },
        include: { properties: { where: { deletedAt: null }, select: { id: true, name: true } } },
      })
    );
    res.json(owner);
  })
);

portalRouter.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const payouts = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.ownerPayout.findMany({
        where: { ownerId: req.ownerId },
        orderBy: { periodStart: "desc" },
      })
    );
    res.json(payouts);
  })
);

// GET /api/portal/payments — paiements des locataires sur les biens de ce
// propriétaire (matrice de permissions, Partie 2 : Paiements = 👁 pour
// owner_viewer). Lecture seule, jamais d'enregistrement de paiement depuis
// le portail — c'est le travail de l'agence.
portalRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const where = { contract: { unit: { property: { ownerId: req.ownerId } } } };

    const [total, payments] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.payment.count({ where }),
        tx.payment.findMany({
          where,
          include: {
            contract: {
              select: {
                tenant: { select: { firstName: true, lastName: true } },
                unit: { select: { number: true, property: { select: { name: true } } } },
              },
            },
          },
          orderBy: { paymentDate: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ])
    );
    res.json(paginate(payments, total, pagination));
  })
);

// GET /api/portal/summary — mois en cours : loyers perçus, commission,
// versements du mois, net à recevoir (même esprit que le tableau de bord
// agence — Partie 5 — mais scopé au patrimoine d'un seul propriétaire).
portalRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const summary = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const latestPayout = await tx.ownerPayout.findFirst({
        where: { ownerId: req.ownerId },
        orderBy: { periodStart: "desc" },
      });

      const propertiesCount = await tx.property.count({
        where: { ownerId: req.ownerId, deletedAt: null },
      });

      const payments = await tx.payment.findMany({
        where: {
          paymentDate: { gte: periodStart },
          contract: { unit: { property: { ownerId: req.ownerId } } },
        },
        select: { amount: true },
      });
      const grossThisMonth = payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));

      return {
        propertiesCount,
        grossThisMonth: grossThisMonth.toString(),
        latestPayout,
      };
    });
    res.json(summary);
  })
);
