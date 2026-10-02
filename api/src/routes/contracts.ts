import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, paginate } from "../lib/pagination";
import { logActivity } from "../lib/activityLog";

export const contractsRouter = Router();

const PAYMENT_FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual", "custom"] as const;

const createContractSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: z.string(), // ISO "YYYY-MM-DD"
  endDate: z.string().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().positive().optional(),
  paymentFrequency: z.enum(PAYMENT_FREQUENCIES).optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  terms: z.string().optional(),
});

const CONTRACT_STATUSES = ["draft", "active", "suspended", "terminated", "expired"] as const;
const updateContractSchema = z.object({
  status: z.enum(CONTRACT_STATUSES).optional(),
  endDate: z.string().optional(),
  terms: z.string().optional(),
});

const contractInclude = {
  tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
  unit: {
    select: {
      id: true,
      number: true,
      unitType: true,
      property: { select: { id: true, name: true } },
    },
  },
  guarantors: true,
} as const;

// GET /api/contracts — liste paginée, tout rôle authentifié.
contractsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const [total, contracts] = await withOrgContext(req.auth!.organizationId, (tx) =>
      Promise.all([
        tx.contract.count(),
        tx.contract.findMany({
          include: contractInclude,
          orderBy: { createdAt: "desc" },
          skip: pagination.skip,
          take: pagination.take,
        }),
      ])
    );
    res.json(paginate(contracts, total, pagination));
  })
);

// POST /api/contracts — le nœud central : lie un local disponible à un locataire.
// Règle métier (cahier des charges §29) : un local occupé doit avoir un contrat actif.
// Appliquée ici, dans la même transaction RLS que la création du contrat — pas par
// trigger SQL, pour garder toute la logique métier au même endroit que les autres
// règles (pénalités, commissions) qui suivront dans les phases suivantes.
contractsRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = createContractSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de contrat invalides." });
    }
    const { startDate, endDate, ...rest } = parsed.data;

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const unit = await tx.unit.findFirst({ where: { id: rest.unitId, deletedAt: null } });
      if (!unit) return { error: "unit_not_found" as const };
      if (unit.status === "occupied") return { error: "unit_occupied" as const };

      const tenant = await tx.tenant.findFirst({ where: { id: rest.tenantId, deletedAt: null } });
      if (!tenant) return { error: "tenant_not_found" as const };

      const contract = await tx.contract.create({
        data: {
          organizationId: req.auth!.organizationId,
          ...rest,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : undefined,
        },
        include: contractInclude,
      });

      await tx.unit.update({ where: { id: rest.unitId }, data: { status: "occupied" } });

      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "contract",
        entityId: contract.id,
        metadata: { unitId: rest.unitId, tenantId: rest.tenantId },
      });

      return { contract };
    });

    if ("error" in result) {
      if (result.error === "unit_not_found") {
        return res.status(404).json({ code: result.error, message: "Local introuvable." });
      }
      if (result.error === "unit_occupied") {
        return res
          .status(409)
          .json({ code: result.error, message: "Ce local est déjà occupé par un contrat actif." });
      }
      return res.status(404).json({ code: result.error, message: "Locataire introuvable." });
    }

    res.status(201).json(result.contract);
  })
);

contractsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const contract = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.contract.findFirst({ where: { id: req.params.id }, include: contractInclude })
    );
    if (!contract) {
      return res.status(404).json({ code: "not_found", message: "Contrat introuvable." });
    }
    res.json(contract);
  })
);

// PATCH /api/contracts/:id — surtout pour les transitions de statut. Quand un
// contrat cesse d'être actif, le local redevient disponible (symétrique de la
// création) — sauf s'il repasse en maintenance entre-temps, ce que ce endpoint
// ne touche pas.
contractsRouter.patch(
  "/:id",
  requireRole("owner", "admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = updateContractSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de contrat invalides." });
    }
    const { endDate, ...rest } = parsed.data;

    const result = await withOrgContext(req.auth!.organizationId, async (tx) => {
      const contract = await tx.contract.findFirst({ where: { id: req.params.id } });
      if (!contract) return null;

      const updated = await tx.contract.update({
        where: { id: req.params.id },
        data: { ...rest, ...(endDate ? { endDate: new Date(endDate) } : {}) },
        include: contractInclude,
      });

      const freesTheUnit = rest.status && ["terminated", "expired"].includes(rest.status);
      if (freesTheUnit) {
        await tx.unit.update({ where: { id: contract.unitId }, data: { status: "available" } });
      }

      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "update",
        entityType: "contract",
        entityId: req.params.id,
        metadata: rest,
      });

      return updated;
    });

    if (!result) {
      return res.status(404).json({ code: "not_found", message: "Contrat introuvable." });
    }
    res.json(result);
  })
);

// --- Garants (A1) — sous-ressource du contrat ---

type ContractParams = { contractId: string };
export const contractGuarantorsRouter = Router({ mergeParams: true });

const guarantorSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  profession: z.string().optional(),
  idDocType: z.string().optional(),
  idDocNumber: z.string().optional(),
  guaranteedAmount: z.number().positive().optional(),
  relationship: z.string().optional(),
});

contractGuarantorsRouter.post(
  "/",
  requireRole("owner", "admin", "manager"),
  asyncHandler<ContractParams>(async (req, res) => {
    const parsed = guarantorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_input", message: "Champs de garant invalides." });
    }

    const guarantor = await withOrgContext(req.auth!.organizationId, async (tx) => {
      // La RLS filtre déjà ce findFirst par organisation — un contrat d'une
      // autre organisation renvoie null, jamais une fuite de données.
      const contract = await tx.contract.findFirst({ where: { id: req.params.contractId } });
      if (!contract) return null;
      const guarantor = await tx.guarantor.create({
        data: { contractId: req.params.contractId, ...parsed.data },
      });
      await logActivity(tx, {
        organizationId: req.auth!.organizationId,
        userId: req.auth!.userId,
        action: "create",
        entityType: "guarantor",
        entityId: guarantor.id,
        metadata: { contractId: req.params.contractId, fullName: guarantor.fullName },
      });
      return guarantor;
    });

    if (!guarantor) {
      return res.status(404).json({ code: "not_found", message: "Contrat introuvable." });
    }
    res.status(201).json(guarantor);
  })
);
