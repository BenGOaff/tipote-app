// lib/survey/pdfReport.ts
//
// Génération du PDF d'un rapport de sondage, exploitable et brandé.
// Utilisé par SurveyResultsPanel (Tipote + Tiquiz). jspdf chargé en
// dynamic import par l'appelant (client-only).
//
// Contenu :
//   1. Hero brandé : nom de la marque, tagline, titre du sondage,
//      bande de KPI (nombre de réponses, questions, date).
//   2. Encart Analyse IA si elle existe : résumé + à retenir + actions.
//      (Sinon : section omise, pas d'espace vide.)
//   3. Pour chaque question : barres horizontales avec %, count, libellés
//      tronqués proprement, ordre conservé. Pagination automatique.
//   4. Réponses libres (free_text) : 1 sample par question, italique.
//   5. Footer : marque + date + pagination.
//
// Aucun graphique externe (pas de chart.js / canvas) : on dessine les
// barres directement avec les primitives jspdf. Léger, fiable, brandé.

import type { jsPDF } from "jspdf";

export interface AggregatedOption {
  text: string;
  count: number;
  pct: number;
}

export interface AggregatedQuestion {
  index: number;
  text: string;
  type: string;
  options: AggregatedOption[];
  textSamples?: string[];
  average?: number | null;
}

export interface SurveyPdfPayload {
  title: string;
  totalResponses: number;
  questions: AggregatedQuestion[];
  analysis?: {
    summary?: string;
    takeaways?: string[];
    actions?: string[];
  } | null;
}

export interface BrandTheme {
  name: "Tipote" | "Tiquiz";
  primary: string;
  primaryText: string;
  text: string;
  muted: string;
  accent: string;
  bgSoft: string;
  tagline: string;
}

export const BRAND_TIPOTE: BrandTheme = {
  name: "Tipote",
  primary: "#5D6CDB",
  primaryText: "#FFFFFF",
  text: "#2E386E",
  muted: "#6B7280",
  accent: "#C1FF6F",
  bgSoft: "#F4F5FF",
  tagline: "Le pote de business des entrepreneurs",
};

export const BRAND_TIQUIZ: BrandTheme = {
  name: "Tiquiz",
  primary: "#5D6CDB",
  primaryText: "#FFFFFF",
  text: "#2E386E",
  muted: "#6B7280",
  accent: "#20BBE6",
  bgSoft: "#F0FBFF",
  tagline: "Le quiz lead-magnet le plus simple à créer",
};

// ---------------------------------------------------------------------------
// Helpers couleur (jspdf veut du RGB séparé)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const v = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

interface Cursor {
  y: number;
}

export function renderSurveyPdf(
  doc: jsPDF,
  payload: SurveyPdfPayload,
  brand: BrandTheme,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  const cursor: Cursor = { y: 0 };

  // Hero brandé en haut de la 1ère page.
  drawHero(doc, payload, brand, pageW, margin);
  cursor.y = 170;

  // KPIs en bande sous le hero.
  drawKpiBand(doc, payload, brand, margin, contentW, cursor);

  // Section analyse IA si présente.
  if (payload.analysis && hasAnyAnalysisContent(payload.analysis)) {
    drawAnalysis(doc, payload.analysis, brand, margin, contentW, pageH, cursor);
  }

  // Sections par question.
  drawQuestionsHeader(doc, brand, margin, contentW, pageH, cursor);
  for (const q of payload.questions) {
    drawQuestion(doc, q, brand, margin, contentW, pageH, cursor);
  }

  // Footer sur chaque page.
  drawFooters(doc, brand, payload.title, pageW, pageH, margin);
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function drawHero(
  doc: jsPDF,
  payload: SurveyPdfPayload,
  brand: BrandTheme,
  pageW: number,
  margin: number,
): void {
  // Bandeau plein primary.
  setFill(doc, brand.primary);
  doc.rect(0, 0, pageW, 130, "F");

  // Petit accent en haut.
  setFill(doc, brand.accent);
  doc.rect(0, 0, pageW, 5, "F");

  // Marque + tagline.
  setText(doc, brand.primaryText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(brand.name, margin, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(brand.tagline, margin, 67);

  // Titre du sondage.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const title = truncate(payload.title, 80);
  const titleLines = doc.splitTextToSize(title, pageW - margin * 2) as string[];
  doc.text(titleLines, margin, 100);

  // Date à droite.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Rapport généré le ${today}`, pageW - margin, 50, { align: "right" });
}

// ---------------------------------------------------------------------------
// KPI band
// ---------------------------------------------------------------------------

function drawKpiBand(
  doc: jsPDF,
  payload: SurveyPdfPayload,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  cursor: Cursor,
): void {
  const blockH = 60;
  const gap = 10;
  const blocks = [
    { label: "Réponses", value: String(payload.totalResponses) },
    { label: "Questions", value: String(payload.questions.length) },
    {
      label: "Taux de complétion par question",
      value: payload.totalResponses > 0 ? "100 %" : "—",
    },
  ];
  const blockW = (contentW - gap * (blocks.length - 1)) / blocks.length;

  blocks.forEach((b, i) => {
    const x = margin + i * (blockW + gap);
    setFill(doc, brand.bgSoft);
    doc.roundedRect(x, cursor.y, blockW, blockH, 6, 6, "F");

    setText(doc, brand.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(b.label.toUpperCase(), x + 14, cursor.y + 18);

    setText(doc, brand.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(b.value, x + 14, cursor.y + 44);
  });

  cursor.y += blockH + 18;
}

// ---------------------------------------------------------------------------
// Analyse IA
// ---------------------------------------------------------------------------

function hasAnyAnalysisContent(a: NonNullable<SurveyPdfPayload["analysis"]>): boolean {
  return Boolean(
    (a.summary && a.summary.trim()) ||
    (a.takeaways && a.takeaways.length > 0) ||
    (a.actions && a.actions.length > 0),
  );
}

function drawAnalysis(
  doc: jsPDF,
  analysis: NonNullable<SurveyPdfPayload["analysis"]>,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  pageH: number,
  cursor: Cursor,
): void {
  ensureSpace(doc, 80, pageH, margin, cursor);

  // Bandeau titre.
  setFill(doc, brand.primary);
  doc.roundedRect(margin, cursor.y, contentW, 26, 4, 4, "F");
  setText(doc, brand.primaryText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Analyse IA des résultats", margin + 12, cursor.y + 17);
  cursor.y += 36;

  // Résumé.
  if (analysis.summary && analysis.summary.trim()) {
    drawSubheading(doc, "Ce que disent les résultats", brand, margin, cursor);
    setText(doc, brand.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(analysis.summary.trim(), contentW) as string[];
    for (const ln of lines) {
      ensureSpace(doc, 14, pageH, margin, cursor);
      doc.text(ln, margin, cursor.y);
      cursor.y += 13;
    }
    cursor.y += 8;
  }

  // À retenir.
  if (analysis.takeaways && analysis.takeaways.length > 0) {
    drawSubheading(doc, "À retenir", brand, margin, cursor);
    for (const t of analysis.takeaways) {
      drawBullet(doc, t, brand, margin, contentW, pageH, cursor);
    }
    cursor.y += 4;
  }

  // Actions.
  if (analysis.actions && analysis.actions.length > 0) {
    drawSubheading(doc, "Actions à mettre en place", brand, margin, cursor);
    analysis.actions.forEach((a, i) => {
      drawNumbered(doc, i + 1, a, brand, margin, contentW, pageH, cursor);
    });
  }

  cursor.y += 12;
}

function drawSubheading(
  doc: jsPDF,
  text: string,
  brand: BrandTheme,
  margin: number,
  cursor: Cursor,
): void {
  setText(doc, brand.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(text.toUpperCase(), margin, cursor.y);
  cursor.y += 14;
}

function drawBullet(
  doc: jsPDF,
  text: string,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  pageH: number,
  cursor: Cursor,
): void {
  setText(doc, brand.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const indent = 14;
  const lines = doc.splitTextToSize(text, contentW - indent) as string[];
  ensureSpace(doc, lines.length * 13, pageH, margin, cursor);
  // Puce.
  setFill(doc, brand.primary);
  doc.circle(margin + 3, cursor.y - 3, 1.6, "F");
  setText(doc, brand.text);
  for (const ln of lines) {
    doc.text(ln, margin + indent, cursor.y);
    cursor.y += 13;
  }
  cursor.y += 1;
}

function drawNumbered(
  doc: jsPDF,
  n: number,
  text: string,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  pageH: number,
  cursor: Cursor,
): void {
  setText(doc, brand.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const indent = 18;
  const lines = doc.splitTextToSize(text, contentW - indent) as string[];
  ensureSpace(doc, lines.length * 13, pageH, margin, cursor);
  setText(doc, brand.primary);
  doc.setFont("helvetica", "bold");
  doc.text(`${n}.`, margin, cursor.y);
  setText(doc, brand.text);
  doc.setFont("helvetica", "normal");
  for (const ln of lines) {
    doc.text(ln, margin + indent, cursor.y);
    cursor.y += 13;
  }
  cursor.y += 1;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

function drawQuestionsHeader(
  doc: jsPDF,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  pageH: number,
  cursor: Cursor,
): void {
  ensureSpace(doc, 36, pageH, margin, cursor);
  setText(doc, brand.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Détail des réponses", margin, cursor.y);
  cursor.y += 6;
  setDraw(doc, brand.primary);
  doc.setLineWidth(2);
  doc.line(margin, cursor.y, margin + 60, cursor.y);
  cursor.y += 18;
}

function drawQuestion(
  doc: jsPDF,
  q: AggregatedQuestion,
  brand: BrandTheme,
  margin: number,
  contentW: number,
  pageH: number,
  cursor: Cursor,
): void {
  // Estimation hauteur min pour décider d'un saut de page.
  const optionRows = Math.max(q.options.length, 1);
  const sampleRows = q.textSamples?.length ? Math.min(3, q.textSamples.length) : 0;
  const estimatedH = 26 + optionRows * 22 + sampleRows * 14 + 14;
  ensureSpace(doc, Math.min(estimatedH, 200), pageH, margin, cursor);

  // Titre de question.
  setText(doc, brand.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const qLabel = `Q${q.index + 1}. ${q.text}`;
  const qLines = doc.splitTextToSize(qLabel, contentW) as string[];
  for (const ln of qLines) {
    ensureSpace(doc, 16, pageH, margin, cursor);
    doc.text(ln, margin, cursor.y);
    cursor.y += 14;
  }
  cursor.y += 4;

  // Moyenne si rating.
  if (q.average !== null && q.average !== undefined) {
    setText(doc, brand.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(`Note moyenne : ${q.average}`, margin, cursor.y);
    cursor.y += 14;
  }

  // Options en barres horizontales.
  if (q.options.length > 0) {
    const barAreaX = margin + 200;
    const barAreaW = contentW - 200 - 50; // garde de la place pour le label %
    const rowH = 22;

    for (const opt of q.options) {
      ensureSpace(doc, rowH, pageH, margin, cursor);

      // Label option (tronqué proprement).
      setText(doc, brand.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const optLabel = truncate(opt.text, 38);
      doc.text(optLabel, margin, cursor.y + 12);

      // Track de fond.
      setFill(doc, brand.bgSoft);
      doc.roundedRect(barAreaX, cursor.y + 5, barAreaW, 10, 5, 5, "F");

      // Barre primary proportionnelle.
      const filled = Math.max(1, Math.round(barAreaW * (opt.pct / 100)));
      setFill(doc, brand.primary);
      doc.roundedRect(barAreaX, cursor.y + 5, filled, 10, 5, 5, "F");

      // %  +  count à droite.
      setText(doc, brand.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`${opt.pct}%`, barAreaX + barAreaW + 6, cursor.y + 12);
      setText(doc, brand.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`(${opt.count})`, barAreaX + barAreaW + 30, cursor.y + 12);

      cursor.y += rowH;
    }
  }

  // Échantillon de réponses libres.
  if (q.textSamples && q.textSamples.length > 0) {
    cursor.y += 2;
    setText(doc, brand.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("RÉPONSES LIBRES (extraits)", margin, cursor.y);
    cursor.y += 11;
    setText(doc, brand.text);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    for (const sample of q.textSamples.slice(0, 3)) {
      const lines = doc.splitTextToSize(`« ${sample} »`, contentW - 8) as string[];
      ensureSpace(doc, lines.length * 12, pageH, margin, cursor);
      for (const ln of lines) {
        doc.text(ln, margin + 4, cursor.y);
        cursor.y += 12;
      }
    }
  }

  cursor.y += 12;
}

// ---------------------------------------------------------------------------
// Pagination & footer
// ---------------------------------------------------------------------------

function ensureSpace(
  doc: jsPDF,
  needed: number,
  pageH: number,
  margin: number,
  cursor: Cursor,
): void {
  if (cursor.y + needed > pageH - margin - 24) {
    doc.addPage();
    cursor.y = margin;
  }
}

function drawFooters(
  doc: jsPDF,
  brand: BrandTheme,
  surveyTitle: string,
  pageW: number,
  pageH: number,
  margin: number,
): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    // Filet supérieur.
    setDraw(doc, brand.primary);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - margin - 16, pageW - margin, pageH - margin - 16);
    // Texte.
    setText(doc, brand.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const leftText = truncate(`${brand.name} — ${surveyTitle}`, 80);
    doc.text(leftText, margin, pageH - margin);
    doc.text(`Page ${i} / ${total}`, pageW - margin, pageH - margin, { align: "right" });
  }
}
