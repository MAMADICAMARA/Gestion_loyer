import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";

export const propertiesRouter = Router();

const createPropertySchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1),
  propertyType: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  description: z.string().optional(),
});

const updatePropertySchema = createPropertySchema.partial();

// GET /api/properties — liste paginée avec compte de locaux (occupés/total).
propertiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const where = { deletedAt: null };

    const [total, properties] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.property.count({ where }),
        tx.property.findMany({
          where,
          include: {
            owner: { select: { id: true, fullName: true } },
            units: { select: { status: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ])
    );

    res.json(
      paginate(
        properties.map(({ units, ...property }) => ({
          ...property,
          unitsTotal: units.length,
          unitsOccupied: units.filter((u) => u.status === "occupied").length,
        })),
        total,
        pagination
      )
    );
  })
);

// POST /api/properties — réservé owner/admin/manager.
propertiesRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = createPropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de propriété invalides." });
    }

    const property = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.property.create({
        data: {
          organizationId: req.auth!.organizationId,
          ...parsed.data,
        },
      })
    );
    res.status(201).json(property);
  })
);

// GET /api/properties/:id — détail avec ses locaux.
propertiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.property.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: {
          owner: { select: { id: true, fullName: true, phone: true, email: true } },
          units: { where: { deletedAt: null }, orderBy: { number: "asc" } },
        },
      })
    );

    if (!property) {
      return res.status(404).json({ code: "not_found", message: "Propriété introuvable." });
    }
    res.json(property);
  })
);

// PATCH /api/properties/:id — mise à jour partielle, réservée owner/admin/manager.
propertiesRouter.patch(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = updatePropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de propriété invalides." });
    }

    const property = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.property.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: parsed.data,
      })
    );

    if (property.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Propriété introuvable." });
    }
    res.status(204).send();
  })
);

// DELETE /api/properties/:id — suppression logique uniquement (jamais de DELETE SQL, cf. E0).
propertiesRouter.delete(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.property.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
    );

    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Propriété introuvable." });
    }
    res.status(204).send();
  })
);
