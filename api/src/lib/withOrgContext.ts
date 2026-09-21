import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exécute `callback` dans une transaction où app.current_org_id est fixé
 * pour la durée de la transaction (SET LOCAL), condition pour que les
 * policies Row Level Security de schema.sql (Partie E7) filtrent
 * correctement les tables organization_id-scopées.
 *
 * SET LOCAL n'accepte pas de paramètre lié ($1) pour une valeur de GUC —
 * d'où la validation stricte du format UUID avant interpolation, seule
 * défense possible contre une injection ici.
 */
export async function withOrgContext<T>(
  organizationId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(organizationId)) {
    throw new Error("withOrgContext: organizationId invalide");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_org_id = '${organizationId}'`
    );
    return callback(tx);
  });
}

export type { PrismaClient };
