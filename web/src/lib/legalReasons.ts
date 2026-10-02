// Libellés français pour les codes de motif de résiliation par défaut
// (cf. api/src/lib/legalSettings.ts, DEFAULT_LEGAL_SETTINGS). Un motif
// personnalisé ajouté depuis /parametres n'a pas d'entrée ici — son code
// brut sert alors de libellé.
const REASON_LABELS: Record<string, string> = {
  impaye: "Impayé",
  faute_grave: "Faute grave",
  vente_bien: "Vente du bien",
  reprise_proprietaire: "Reprise par le propriétaire",
  fin_de_contrat: "Fin de contrat",
  autre: "Autre",
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}
