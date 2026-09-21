import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { authRouter } from "./routes/auth";
import { requireAgencyStaff, requireAuth } from "./middleware/auth";
import { ownersRouter } from "./routes/owners";
import { propertiesRouter } from "./routes/properties";
import { propertyUnitsRouter, unitsRouter } from "./routes/units";
import { tenantsRouter } from "./routes/tenants";
import { contractGuarantorsRouter, contractsRouter } from "./routes/contracts";
import { contractInvoicesRouter, invoicesRouter } from "./routes/invoices";
import { invoicePaymentsRouter } from "./routes/payments";
import { paymentMethodsRouter } from "./routes/paymentMethods";
import { dashboardRouter } from "./routes/dashboard";
import { ownerPayoutsRouter, payoutsRouter } from "./routes/payouts";
import { portalRouter } from "./routes/portal";
import { usersRouter } from "./routes/users";

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gera-api" });
});

app.use("/api/auth", authRouter);

// Le portail owner_viewer a sa propre portée (routes/portal.ts) — jamais le
// garde-fou agence ci-dessous, qui l'exclut justement.
app.use("/api/portal", requireAuth, portalRouter);

// Tout le reste est réservé au personnel de l'agence (owner/admin/manager/
// agent) : requireAgencyStaff bloque explicitement owner_viewer, qui sinon
// resterait un compte authentifié valide pour la RLS (isolée par
// organisation, pas par propriétaire) et pourrait lire les données de tous
// les propriétaires de l'agence via ces routes plutôt que /api/portal/*.
app.use("/api/owners/:id/payouts", requireAuth, requireAgencyStaff, ownerPayoutsRouter);
app.use("/api/owners", requireAuth, requireAgencyStaff, ownersRouter);
app.use("/api/payouts", requireAuth, requireAgencyStaff, payoutsRouter);
app.use("/api/properties/:propertyId/units", requireAuth, requireAgencyStaff, propertyUnitsRouter);
app.use("/api/properties", requireAuth, requireAgencyStaff, propertiesRouter);
app.use("/api/units", requireAuth, requireAgencyStaff, unitsRouter);
app.use("/api/tenants", requireAuth, requireAgencyStaff, tenantsRouter);
app.use("/api/contracts/:contractId/guarantors", requireAuth, requireAgencyStaff, contractGuarantorsRouter);
app.use("/api/contracts/:contractId/invoices", requireAuth, requireAgencyStaff, contractInvoicesRouter);
app.use("/api/contracts", requireAuth, requireAgencyStaff, contractsRouter);
app.use("/api/invoices/:invoiceId/payments", requireAuth, requireAgencyStaff, invoicePaymentsRouter);
app.use("/api/invoices", requireAuth, requireAgencyStaff, invoicesRouter);
app.use("/api/payment-methods", requireAuth, requireAgencyStaff, paymentMethodsRouter);
app.use("/api/dashboard", requireAuth, requireAgencyStaff, dashboardRouter);
app.use("/api/users", requireAuth, requireAgencyStaff, usersRouter);

app.use((_req, res) => {
  res.status(404).json({ code: "not_found", message: "Ressource introuvable." });
});

// Filet de sécurité global : toute erreur remontée par asyncHandler() (panne
// DB transitoire, bug applicatif...) atterrit ici en JSON propre — jamais en
// crash du process qui couperait toutes les organisations connectées.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[unhandled]", err);
  res.status(500).json({ code: "internal_error", message: "Une erreur interne est survenue." });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`gera-api à l'écoute sur http://localhost:${port}`);
});

// Dernier filet : si malgré tout une rejection échappe à Express (ex. dans
// un callback hors requête HTTP), on log au lieu de laisser Node tuer le
// process — Node 15+ crashe par défaut sur unhandledRejection.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
