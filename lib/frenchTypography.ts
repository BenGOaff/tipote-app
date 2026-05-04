// French typography helpers.
//
// In French, a non-breaking space precedes the punctuation marks `:`, `;`,
// `!`, `?` and `»`, and follows `«`. Swap ASCII space → NBSP because the
// regular space gets stripped or visually collapsed in some rendering
// contexts (Word paste artefacts, contentEditable normalisation, narrow
// fonts), which is the bug Gwenn reported on tiquiz on 2026-05-02 and
// applies identically to tipote since both apps share the same editor
// stack.
//
// We apply the rules on the server when persisting a quiz whose locale is
// French, AND on the client when rendering arbitrary text — so even
// legacy rows that were saved before the fix display correctly without a
// re-save.
//
// The transformation is conservative and idempotent:
//   • NBSP is only inserted between a Unicode letter/digit (`\p{L}|\p{N}`)
//     and the punctuation mark, never inside URLs (no whitespace there)
//     nor inside CSS in style attributes (`color:red` has no space; the
//     unusual `color : red` would be touched but that's a non-issue).
//   • Already-NBSP gaps are left untouched (the regex requires a literal
//     ASCII space before the mark).
//   • Calling the function twice yields the same string — no compounding.

const NBSP = " ";

const CLOSING_PUNCT = /([\p{L}\p{N}]) ([:;!?»])/gu;
const OPENING_QUOTE = /(«) ([\p{L}\p{N}])/gu;

export function isFrenchLocale(locale: string | null | undefined): boolean {
  if (!locale) return false;
  return locale.toLowerCase().startsWith("fr");
}

export function applyFrenchTypography(
  text: string | null | undefined,
  locale: string | null | undefined,
): string {
  if (!text) return "";
  if (!isFrenchLocale(locale)) return text;
  return text
    .replace(CLOSING_PUNCT, `$1${NBSP}$2`)
    .replace(OPENING_QUOTE, `$1${NBSP}$2`);
}

export function applyFrenchTypographyToHtml(
  html: string | null | undefined,
  locale: string | null | undefined,
): string {
  return applyFrenchTypography(html, locale);
}
