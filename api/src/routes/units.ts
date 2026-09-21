import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";

const createUnitSchema = z.object({
  number: z.string().min(1),
  unitType: z.string().min(1),
  floor: z.string().optional(),
  areaSqm: z.number().positive().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().positive().optional(),
  description: z.string().optional(),
});

const UNIT_STATUSES = ["available", "reserved", "occupied", "maintenance", "out_of_service"] as const;
const updateUnitSchema = createUnitSchema.partial().extend({
  status: z.enum(UNIT_STATUSES).optional(),
});

type PropertyUnitParams = { propertyId: string };

// Monté sur /api/properties/:propertyId/units (mergeParams pour lire propertyId).
export const propertyUnitsRouter = Router({ mergeParams: true });

propertyUnitsRouter.get(
  "/",
  asyncHandler<PropertyUnitParams>(async (req, res) => {
    const units = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.unit.findMany({
        where: { propertyId: req.params.propertyId, deletedAt: null },
        orderBy: { number: "asc" },
      })
    );
    res.json(units);
  })
);

propertyUnitsRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler<PropertyUnitParams>(async (req, res) => {
    const parsed = createUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de local invalides." });
    }

    const unit = await withOrgContext(req.auth!.organizationId, async (tx) => {
      // Le local doit appartenir à une propriété de la même organisation —
      // la RLS filtre déjà findFirst, donc un résultat vide = accès refusé/inexistant.
      const property = await tx.property.findFirst({
        where: { id: req.params.propertyId, deletedAt: null },
        select: { id: true },
      });
      if (!property) return null;

      return tx.unit.create({
        data: {
          // organization_id est de toute façon réécrit par le trigger
          // sync_unit_organization_id (dérivé de property_id) — voir schema.sql §2.
          organizationId: req.auth!.organizationId,
          propertyId: req.params.propertyId,
          ...parsed.data,
        },
      });
    });

    if (!unit) {
      return res.status(404).json({ code: "not_found", message: "Propriété introuvable." });
    }
    res.status(201).json(unit);
  })
);

// Monté sur /api/units — mise à jour directe d'un local par son id.
export const unitsRouter = Router();

unitsRouter.patch(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = updateUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de local invalides." });
    }

    const result = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.unit.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: parsed.data,
      })
    );

    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Local introuvable." });
    }
    res.status(204).send();
  })
);

unitsRouter.delete(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.unit.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
    );

    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Local introuvable." });
    }
    res.status(204).send();
  })
);
