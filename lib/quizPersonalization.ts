// Quiz text personalization helpers.
// Supports two interpolation patterns written by the quiz author (or the AI):
//
//   {name}            → visitor's first name (empty string if not captured)
//   {m|f|x}           → three-way split by gender: masculine | feminine | inclusive
//                        (e.g. "prêt|prête|prêt·e", "he|she|they", "él|ella|elle")
//
// Escape literal braces by doubling: "{{" and "}}".

export type QuizGender = "m" | "f" | "x";

export type QuizPersonalization = {
  /** Visitor's first name; empty / undefined → "{name}" collapses to "". */
  name?: string | null;
  /** Visitor's chosen grammatical gender; falls back to inclusive ("x"). */
  gender?: QuizGender | null;
};

const ESC_OPEN = " OPEN ";
const ESC_CLOSE = " CLOSE ";

function pickVariant(body: string, gender: QuizGender): string {
  const parts = body.split("|");
  const [masc = "", fem = "", inc = ""] = parts;
  switch (gender) {
    case "m": return masc || fem || inc;
    case "f": return fem || masc || inc;
    case "x":
    default: return inc || fem || masc;
  }
}

export function interpolateText(
  text: string | null | undefined,
  p: QuizPersonalization = {},
): string {
  if (!text) return "";
  const gender: QuizGender = (p.gender ?? "x") as QuizGender;
  const name = (p.name ?? "").trim();

  const safe = text.replace(/\{\{/g, ESC_OPEN).replace(/\}\}/g, ESC_CLOSE);

  const replaced = safe.replace(/\{([^{}]+)\}/g, (match, inner: string) => {
    const body = inner.trim();
    if (body === "name") return name;
    if (body.includes("|")) return pickVariant(body, gender);
    return match;
  });

  // Bug Gwenn 2026-05-04 (port from tiquiz) : `\s+([.,;:!?»)])` matchait
  // U+00A0 et arrachait le NBSP que applyFrenchTypography ajoutait avant
  // les deux-points français. On restreint le strip aux espaces ASCII /
  // tabulations — le NBSP reste, l'apparence "X : Y" est préservée.
  const cleaned = replaced
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?»)])/g, "$1").trim())
    .join("\n");

  return cleaned.replace(new RegExp(ESC_OPEN, "g"), "{").replace(new RegExp(ESC_CLOSE, "g"), "}");
}

export function makeInterpolator(p: QuizPersonalization) {
  return (text: string | null | undefined) => interpolateText(text, p);
}

export const GENDER_LABELS: Record<string, Record<QuizGender, string>> = {
  fr: { m: "Il", f: "Elle", x: "Iel" },
  en: { m: "He", f: "She", x: "They" },
  es: { m: "Él", f: "Ella", x: "Elle" },
  it: { m: "Lui", f: "Lei", x: "Neutro" },
  ar: { m: "هو", f: "هي", x: "محايد" },
};

export function getGenderLabels(locale: string | null | undefined): Record<QuizGender, string> {
  const key = (locale ?? "fr").slice(0, 2).toLowerCase();
  return GENDER_LABELS[key] ?? GENDER_LABELS.fr;
}
