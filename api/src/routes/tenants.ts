import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";
import { logActivity } from "../lib/activityLog";

export const tenantsRouter = Router();

const tenantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  profession: z.string().optional(),
  birthDate: z.string().optional(), // ISO "YYYY-MM-DD"
  idDocType: z.string().optional(),
  idDocNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
});

const updateTenantSchema = tenantSchema.partial();

function toPrismaData(input: z.infer<typeof updateTenantSchema>) {
  const { birthDate, ...rest } = input;
  return {
    ...rest,
    ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
  };
}

// GET /api/tenants — liste paginée, tout rôle authentifié (agent inclus, cf. matrice de permissions).
tenantsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const where = { deletedAt: null };

    const [total, tenants] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.tenant.count({ where }),
        tx.tenant.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      ])
    );
    res.json(paginate(tenants, total, pagination));
  })
);

// POST /api/tenants — agent inclus (il gère les locataires au quotidien).
tenantsRouter.post(
  "/",
  requireRole("owner", "admin", "manager", "agent"),
  asyncHandler(async (req, res) => {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de locataire invalides." });
    }

    const { birthDate, ...fields } = parsed.data;
    const tenant = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const created = await tx.tenant.create({
        data: {
          organizationId: req.auth!.organizationId,
          ...fields,
          ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
        },
      });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "tenant",
        entityId: created.id,
        metadata: { firstName: created.firstName, lastName: created.lastName },
      });
      return created;
    });
    res.status(201).json(tenant);
  })
);

tenantsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenant = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } })
    );
    if (!tenant) {
      return res.status(404).json({ code: "not_found", message: "Locataire introuvable." });
    }
    res.json(tenant);
  })
);

tenantsRouter.patch(
  "/:id",
  requireRole("owner", "admin", "manager", "agent"),
  asyncHandler(async (req, res) => {
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de locataire invalides." });
    }

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: toPrismaData(parsed.data),
      });
      if (updated.count > 0) {
        await logActivity(tx, {
          organizationId: req.auth!.organizationId,
          userId: req.auth!.userId,
          action: "update",
          entityType: "tenant",
          entityId: req.params.id,
        });
      }
      return updated;
    });
    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Locataire introuvable." });
    }
    res.status(204).send();
  })
);

// Locataires : accès complet pour agent aussi (matrice de permissions,
// Partie 2 du cahier des charges — seule ligne où agent a ✅ et pas 👁).
tenantsRouter.delete(
  "/:id",
  requireRole("owner", "admin", "manager", "agent"),
  asyncHandler(async (req, res) => {
    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const deleted = await tx.tenant.updateMany({
        where: { id: req.params.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (deleted.count > 0) {
        await logActivity(tx, {
          organizationId: req.auth!.organizationId,
          userId: req.auth!.userId,
          action: "delete",
          entityType: "tenant",
          entityId: req.params.id,
        });
      }
      return deleted;
    });
    if (result.count === 0) {
      return res.status(404).json({ code: "not_found", message: "Locataire introuvable." });
    }
    res.status(204).send();
  })
);
