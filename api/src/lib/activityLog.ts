import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Journal d'activité (cahier des charges, module Gouvernance) : "toute
// opération sensible tracée — qui, quoi, quand. Écriture seule, jamais
// modifiable ni supprimable." Appelé à l'intérieur de la même transaction
// RLS que la mutation qu'il enregistre, jamais après coup — si la
// transaction échoue, la trace n'existe pas non plus.
export async function logActivity(
  tx: Tx,
  params: {
    organizationId: string;
    userId: string | null;
    action: "create" | "update" | "delete";
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await tx.activityLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      ...(params.metadata ? { metadata: params.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
