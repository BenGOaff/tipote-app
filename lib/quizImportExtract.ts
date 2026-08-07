// lib/quizImportExtract.ts
// Extraction de texte depuis un fichier d'import quiz/sondage.
// Supporte : .txt (passthrough), .docx (mammoth), .pdf (pdf-parse).
//
// On extrait le texte CÔTÉ SERVEUR : pour .docx et .pdf, le navigateur
// ne sait pas lire les binaires sans library — historiquement on ne
// gérait que .txt et tout le reste tombait sur "format non supporté"
// (cf. import d'Adeline 1er juin 2026, "import a échoué" en .docx).
//
// -- L'IMPORT PDF N'AVAIT JAMAIS MARCHÉ (François Xavier, 7 août 2026) --
//
// `pdf-parse` v1 s'appelait comme une fonction : `pdfParse(buffer)`.
// La v2 est une réécriture complète : elle exporte une CLASSE `PDFParse`
// et n'a plus de default export du tout. Le code appelait donc un objet,
// ce qui lève `pdfParse is not a function`, minifié en prod en
// `r is not a function`. Tous les PDF, depuis le 27 juillet.
//
// **Et le compilateur le savait.** `tsc` répond "Module has no default
// export" sur `import pdfParse from "pdf-parse"` : les types livrés par
// la v2 sont justes. Le bug a survécu parce que l'ancien code forçait le
// silence avec un `as unknown as`, qui ne convertit pas une valeur mais
// interdit au compilateur de la vérifier.
//
// **Règle : pas de `as unknown as` sur un module externe.** Une double
// assertion désactive exactement le contrôle qui aurait signalé le
// changement d'API. S'il faut en écrire une, c'est le signe qu'on n'a pas
// lu ce que le module exporte vraiment.

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import { classifyPdfError, type ImportFailureReason } from "./quiz/importFailure";

export type ImportSourceKind = "txt" | "docx" | "pdf";

const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo en upload
const MAX_TEXT_CHARS = 50_000; // borne envoyée à l'IA (cf. generate route)

export function detectKind(name: string, mime: string): ImportSourceKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt") || mime === "text/plain") return "txt";
  if (
    lower.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return "docx";
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  return null;
}

/** Sortie unique : le texte, ou une RAISON que l'écran traduit lui-même. */
export type ExtractResult =
  | { ok: true; text: string; kind: ImportSourceKind }
  | { ok: false; reason: ImportFailureReason };

/**
 * Extrait le texte d'un PDF.
 *
 * `pageJoiner: ""` retire le séparateur que la v2 ajoute par défaut en
 * fin de page (`-- 1 of 3 --`). Sans ça il partirait dans le prompt IA
 * comme s'il faisait partie du document, et l'IA en ferait une question.
 * Les pages restent séparées : la librairie termine déjà chacune par une
 * ligne vide.
 */
async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  // `destroy()` libère le document et le worker pdfjs. Le serveur est un
  // process pm2 qui vit des semaines : sans ce `finally`, chaque import
  // laisserait derrière lui de quoi grignoter la mémoire jusqu'au
  // redémarrage.
  const parser = new PDFParse({ data: bytes });
  try {
    const resultat = await parser.getText({ pageJoiner: "" });
    const text = String(resultat?.text ?? "").trim();
    if (!text) {
      // Le PDF est lisible mais ne contient aucun texte : c'est un scan
      // ou un export en image. Rien à réparer chez nous.
      return { ok: false, reason: "pdf_no_text" };
    }
    return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind: "pdf" };
  } catch (e) {
    console.error("[quizImportExtract] pdf:", e);
    return { ok: false, reason: classifyPdfError(e) };
  } finally {
    await parser.destroy().catch(() => {
      /* le nettoyage ne doit jamais masquer l'erreur d'origine */
    });
  }
}

export async function extractImportText(
  buffer: Buffer,
  kind: ImportSourceKind,
): Promise<ExtractResult> {
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  try {
    if (kind === "txt") {
      const text = buffer.toString("utf-8").trim();
      if (!text) return { ok: false, reason: "empty_file" };
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind };
    }

    if (kind === "docx") {
      // Mammoth → texte brut, ignore les styles. Suffisant pour
      // alimenter le prompt IA (le contenu compte, pas la mise en forme).
      const { value } = await mammoth.extractRawText({ buffer });
      const text = String(value || "").trim();
      if (!text) return { ok: false, reason: "docx_no_text" };
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind };
    }

    if (kind === "pdf") {
      // Copie explicite : la librairie peut transférer le tableau au
      // worker, ce qui DÉTACHE la mémoire sous-jacente. Un Buffer Node
      // partage souvent son ArrayBuffer avec d'autres, donc on ne lui
      // donne jamais le nôtre.
      return await extractPdf(new Uint8Array(buffer));
    }

    return { ok: false, reason: "unsupported_format" };
  } catch (e) {
    console.error("[quizImportExtract] parse error:", e);
    return { ok: false, reason: "extract_failed" };
  }
}
