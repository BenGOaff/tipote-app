// lib/quizImportExtract.ts
// Extraction de texte depuis un fichier d'import quiz/sondage.
// Supporte : .txt (passthrough), .docx (mammoth), .pdf (pdf-parse).
//
// On extrait le texte CÔTÉ SERVEUR : pour .docx et .pdf, le navigateur
// ne sait pas lire les binaires sans library — historiquement on ne
// gérait que .txt et tout le reste tombait sur "format non supporté"
// (cf. import d'Adeline 1er juin 2026, "import a échoué" en .docx).
//
// La sortie est un texte brut prêt à être envoyé au prompt IA
// (buildQuizImportPrompt / buildSurveyImportPrompt), même format
// qu'auparavant pour .txt → zéro impact sur les prompts existants.

import mammoth from "mammoth";

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

/** Sortie unique : { ok, text, kind } ou { ok:false, error, hint }.
 *  Le hint est destiné au toast côté client. */
export type ExtractResult =
  | { ok: true; text: string; kind: ImportSourceKind }
  | { ok: false; error: string; hint?: string };

export async function extractImportText(
  buffer: Buffer,
  kind: ImportSourceKind,
): Promise<ExtractResult> {
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, error: "file_too_large", hint: "Le fichier dépasse 10 Mo." };
  }

  try {
    if (kind === "txt") {
      const text = buffer.toString("utf-8").trim();
      if (!text) return { ok: false, error: "empty_file", hint: "Le fichier est vide." };
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind };
    }

    if (kind === "docx") {
      // Mammoth → texte brut, ignore les styles. Suffisant pour
      // alimenter le prompt IA (le contenu compte, pas la mise en forme).
      const { value } = await mammoth.extractRawText({ buffer });
      const text = String(value || "").trim();
      if (!text) {
        return {
          ok: false,
          error: "docx_no_text",
          hint: "Aucun texte trouvé dans le .docx. Le fichier contient-il uniquement des images ?",
        };
      }
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind };
    }

    if (kind === "pdf") {
      // Import dynamique : pdf-parse charge des fonts à l'init du module,
      // on le retarde au strict moment où on en a besoin pour éviter
      // un fail global de la route s'il y a un souci d'env.
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as unknown as { default?: typeof pdfParseModule } & typeof pdfParseModule).default
        ?? (pdfParseModule as unknown as (b: Buffer) => Promise<{ text: string }>);
      const data = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buffer);
      const text = String(data?.text || "").trim();
      if (!text) {
        return {
          ok: false,
          error: "pdf_no_text",
          hint: "Aucun texte extractible du PDF. C'est probablement un scan/image — exporte-le en .docx ou .txt et réessaie.",
        };
      }
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), kind };
    }

    return { ok: false, error: "unsupported_kind" };
  } catch (e) {
    console.error("[quizImportExtract] parse error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: "parse_failed", hint: `Erreur lors de la lecture du fichier : ${msg.slice(0, 200)}` };
  }
}
