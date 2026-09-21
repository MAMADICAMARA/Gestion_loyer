import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signTokens(user: { id: string; organizationId: string; role: string }) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret) {
    throw new Error("JWT_ACCESS_SECRET / JWT_REFRESH_SECRET absents des variables d'environnement.");
  }

  const payload = {
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, accessSecret, {
    expiresIn: (process.env.JWT_ACCESS_TTL ?? "15m") as SignOptions["expiresIn"],
  });
  const refreshToken = jwt.sign(payload, refreshSecret, {
    expiresIn: (process.env.JWT_REFRESH_TTL ?? "30d") as SignOptions["expiresIn"],
  });

  return { accessToken, refreshToken };
}

// POST /api/auth/login — la porte d'entrée.
// Interroge `users` directement : à ce stade on ne connaît pas encore
// l'organisation de l'appelant, donc aucun contexte RLS ne peut (ni ne doit)
// être fixé avant l'authentification elle-même.
authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "invalid_input", message: "Email ou mot de passe manquant/invalide." });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Message volontairement identique que l'utilisateur existe ou non —
  // ne jamais révéler si un email est enregistré sur la plateforme.
  const invalidCredentials = () =>
    res.status(401).json({ code: "invalid_credentials", message: "Identifiants incorrects." });

  if (!user || !user.isActive) return invalidCredentials();

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) return invalidCredentials();

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = signTokens({ id: user.id, organizationId: user.organizationId, role: user.role });

  return res.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
  });
}));

// GET /api/auth/me — vérifie qu'un jeton émis par /login est bien accepté.
authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { organization: { select: { name: true, orgType: true } } },
  });

  if (!user) {
    return res.status(404).json({ code: "not_found", message: "Utilisateur introuvable." });
  }

  return res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    organization: user.organization,
  });
}));
