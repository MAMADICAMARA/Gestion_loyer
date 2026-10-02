import PDFDocument from "pdfkit";

export interface ReceiptData {
  receiptNumber: string;
  organizationName: string;
  ownerName: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  periodStart: Date;
  periodEnd: Date;
  amount: string;
  paymentMethodLabel: string;
  reference: string | null;
  paymentDate: Date;
  remainingBalance: string;
}

const INK = "#18130f";
const SUB = "#8a7f72";
const LINE = "#e4ddd2";
const PAGE_LEFT = 56;
const PAGE_RIGHT = 539;

const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR");

// Regroupement par milliers avec une espace ordinaire : `toLocaleString("fr-FR")`
// utilise une espace fine insécable (U+202F) que la police de base PDFKit
// (Helvetica/WinAnsi) ne sait pas afficher — elle sortait littéralement en "/".
function fmtAmount(n: string): string {
  const grouped = Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} GNF`;
}

function rule(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.6);
  doc.strokeColor(LINE).moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).stroke();
  doc.moveDown(0.8);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(10).fillColor(SUB).text(label, PAGE_LEFT, y, { width: 190 });
  const afterLabel = doc.y;
  doc.fontSize(11).fillColor(INK).text(value, PAGE_LEFT + 200, y, { width: 283 });
  doc.y = Math.max(afterLabel, doc.y) + 6;
}

// Reçu généré à la volée depuis `payments` (pas de table dédiée — cf. cahier
// des charges v3.0, module "Reçus de paiement" : Renvoi BDD = "Généré depuis
// payments").
export function renderReceiptPdf(data: ReceiptData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_LEFT });

  doc.fontSize(9).fillColor(SUB).text("GÉRA — GESTION LOCATIVE", { characterSpacing: 1 });
  doc.moveDown(0.4);
  doc.fontSize(20).fillColor(INK).text("Reçu de paiement");
  doc.fontSize(10).fillColor(SUB).text(`N° ${data.receiptNumber}`);
  rule(doc);

  row(doc, "Organisation", data.organizationName);
  row(doc, "Propriétaire", data.ownerName);
  row(doc, "Locataire", data.tenantName);
  row(doc, "Bien", `${data.propertyName} · ${data.unitNumber}`);
  row(doc, "Période", `${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`);
  rule(doc);

  row(doc, "Montant réglé", fmtAmount(data.amount));
  row(doc, "Moyen de paiement", data.paymentMethodLabel);
  row(doc, "Référence", data.reference ?? "—");
  row(doc, "Date du paiement", fmtDate(data.paymentDate));
  rule(doc);

  row(doc, "Solde restant sur la facture", fmtAmount(data.remainingBalance));

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor(SUB)
    .text("Document généré automatiquement — Géra, gestion locative.", PAGE_LEFT, doc.y);

  return doc;
}
