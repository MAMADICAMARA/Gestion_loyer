import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface LegalSettings {
  noticePeriodDays: number;
  depositCapMonths: number | null;
  terminationReasons: string[];
}

// Conformité légale locale (A12) : valeurs par défaut raisonnables tant
// qu'aucun juriste guinéen ne les a validées — jamais codées en dur dans la
// logique métier elle-même (contracts.ts les lit toujours via cette
// fonction, jamais en constante locale), seulement ici, comme repli pour
// une organisation qui n'a pas encore visité l'écran Paramètres.
export const DEFAULT_LEGAL_SETTINGS: LegalSettings = {
  noticePeriodDays: 90,
  depositCapMonths: null,
  terminationReasons: ["impaye", "faute_grave", "vente_bien", "reprise_proprietaire", "fin_de_contrat", "autre"],
};

export async function getLegalSettings(tx: Tx, organizationId: string): Promise<LegalSettings> {
  const row = await tx.organizationSettings.findUnique({ where: { organizationId } });
  if (!row) return DEFAULT_LEGAL_SETTINGS;
  return {
    noticePeriodDays: row.noticePeriodDays,
    depositCapMonths: row.depositCapMonths ? Number(row.depositCapMonths) : null,
    terminationReasons: row.terminationReasons as string[],
  };
}
