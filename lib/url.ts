// lib/url.ts
// Tiny URL helper used to normalise user-entered URLs before they're
// rendered as <a href=...>. Most creators just type "monsite.com/privacy"
// without a protocol; without normalisation that becomes a RELATIVE
// link → the visitor lands on app.tipote.com/monsite.com/privacy →
// 404 → Chrome shows its "page introuvable" wall.
//
// We never throw — invalid input returns the original string so the
// link still renders something even if it's not perfect.
//
// USAGE
//   <a href={ensureExternalUrl(quiz.privacy_url)} target="_blank">
//     Mentions légales
//   </a>

const URL_PROTOCOL_RE = /^[a-z][a-z0-9+\-.]*:/i;

/**
 * Make sure a user-entered URL is safe to drop in an <a href>:
 *   - If empty / whitespace only → returns "" so the caller can hide the link.
 *   - If starts with "//" → prepends "https:" (protocol-relative).
 *   - If starts with "/" → returned as-is (true in-app relative links).
 *   - If has any protocol already (https:, mailto:, tel:, ftp:…) → returned as-is.
 *   - Otherwise (most user-typed values like "monsite.com/privacy") → prepends "https://".
 *
 * Importantly we DO NOT touch javascript:/data: URIs — callers that need
 * to filter those should sanitise separately. We just take care of the
 * "missing protocol" case which is the realistic input failure.
 */
export function ensureExternalUrl(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return s;
  if (URL_PROTOCOL_RE.test(s)) return s;
  return `https://${s}`;
}

/**
 * Same as ensureExternalUrl but explicitly returns null when the input
 * is empty — handy in conditional-render scenarios where the absence
 * of a URL means "skip this <a> altogether".
 */
export function ensureExternalUrlOrNull(raw: string | null | undefined): string | null {
  const out = ensureExternalUrl(raw);
  return out || null;
}
