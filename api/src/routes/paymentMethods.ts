import { Router } from "express";
import { withOrgContext } from "../lib/withOrgContext";
import { asyncHandler } from "../lib/asyncHandler";

export const paymentMethodsRouter = Router();

// GET /api/payment-methods — moyens globaux + ceux propres à l'organisation.
paymentMethodsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const methods = await withOrgContext(req.auth!.organizationId, (tx) =>
      tx.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      })
    );
    res.json(methods);
  })
);
