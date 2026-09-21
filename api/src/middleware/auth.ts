import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  role: string;
}

/**
 * Vérifie le JWT d'accès (porte d'entrée de toute route protégée) et
 * attache req.auth. Ne fixe PAS le contexte RLS lui-même — chaque route
 * qui touche une table organization_id-scopée doit passer par
 * withOrgContext(req.auth.organizationId, ...) au moment de la requête.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ code: "unauthenticated", message: "Jeton d'accès manquant." });
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    return res.status(500).json({ code: "server_misconfigured", message: "JWT_ACCESS_SECRET absent." });
  }

  try {
    const payload = jwt.verify(token, secret) as AccessTokenPayload;
    req.auth = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
    };
    next();
  } catch {
    return res.status(401).json({ code: "invalid_token", message: "Jeton d'accès invalide ou expiré." });
  }
}

/**
 * Réserve une route à une liste de rôles.
 *
 * Matrice de permissions — 6 rôles (cahier des charges v3.0, Partie 2) :
 * ✅ accès complet · 👁 lecture seule · ❌ aucun accès
 *
 *                        Owner  Admin  Manager  Agent  Owner-viewer  Tenant
 * Propriétés              ✅     ✅      ✅       👁     👁 (siennes)    —
 * Locataires               ✅     ✅      ✅       ✅          —        👁 (soi)
 * Paiements                ✅     ✅      ✅       ✅          👁        👁 (soi)
 * Dépenses (V2)             ✅     ✅      ✅       ❌          👁          —
 * Rapports financiers      ✅     ✅      ✅       ❌     👁 (siens)      —
 * Utilisateurs             ✅     ✅      ❌       ❌          —          —
 * Paramètres (V2)          ✅     ✅      ❌       ❌          —          —
 *
 * Owner-viewer et Tenant ne passent jamais par requireRole côté agence :
 * Owner-viewer est bloqué en amont par requireAgencyStaff et a son propre
 * routeur (routes/portal.ts, scopé à son owner_id) ; Tenant (portail
 * locataire) est V3, non implémenté. "Rapports financiers" recouvre ici le
 * tableau de bord agrégé (routes/dashboard.ts) — un agent garde un accès
 * complet aux factures/paiements individuels (routes/invoices.ts,
 * payments.ts), seuls les agrégats (chiffre d'affaires, total impayé du
 * portefeuille) lui sont masqués. À utiliser après requireAuth, qui pose
 * req.auth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ code: "unauthenticated", message: "Jeton d'accès manquant." });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ code: "forbidden", message: "Vous n'êtes pas autorisé à effectuer cette action." });
    }
    next();
  };
}

/**
 * Garde-fou pour TOUTES les routes côté agence (patrimoine, locataires,
 * contrats, facturation, tableau de bord...) : réservées aux quatre rôles
 * opérationnels. Sans ce filtre, un compte owner_viewer — authentifié,
 * donc valide pour la RLS qui n'isole que par organisation — pouvait
 * appeler ces routes en lecture et voir les données de TOUS les
 * propriétaires de l'agence, pas seulement les siennes (la portée par
 * propriétaire est un filtre applicatif, cf. routes/portal.ts, que la RLS
 * ne connaît pas). À monter juste après requireAuth sur chaque routeur
 * agence — jamais sur /api/portal ni /api/auth.
 */
export const requireAgencyStaff = requireRole("owner", "admin", "manager", "agent");
