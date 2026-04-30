// lib/pages/preserveInlineEdits.ts
// Critical safety net for hosted_pages rebuild paths.
//
// Why this exists:
// PageBuilder's iframe lets users click on any text element flagged
// `data-editable="true"` and retype it directly in the live preview.
// Those inline edits live ONLY in the saved html_snapshot — the
// underlying content_data JSON is NOT updated by inline editing.
//
// When something later triggers a server-side rebuild (chat AI
// regen, brand swap, layout change, settings fan-out, …),
// buildPage() rebuilds html_snapshot FROM content_data — which
// means every inline edit silently disappears.
//
// Marie-Paule lost ~9 days of writing this way (2026-04-29 incident:
// 'J'ai longtemps été cette femme qui gérait tout, anticipait tout,
// contrôlait tout' overwriting her own customised text).
//
// This helper closes the loop: BEFORE accepting a rebuild output,
// extract every `id` → text-node mapping from the OLD html_snapshot
// (the version with the user's inline edits in place), then walk
// the NEW html_snapshot and put those texts back wherever the same
// id appears. Structural changes (new sections, brand colors,
// layout) come through; user TEXT survives.
//
// Conservative behaviour:
//   - Only elements that carry `data-editable="true"` AND a stable
//     `id="…"` are eligible. Anything else (the AI-generated
//     scaffolding, generated section ids without user edits) is
//     left alone.
//   - When an old id doesn't appear in the new HTML (section
//     removed by chat regen) we don't try to inject — silent skip.
//   - When an old id has empty text (user blanked it) we still
//     write the empty string, respecting their explicit clear.

const EDITABLE_TAG_RE =
  /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*\sdata-editable\s*=\s*["']?true["']?[^>]*)>([\s\S]*?)<\/\1>/g;
const ID_ATTR_RE = /\sid\s*=\s*["']([^"']+)["']/i;

/**
 * Pull every `id → innerHTML` pair for tags carrying
 * `data-editable="true"` out of an html string.
 *
 * Why innerHTML and not plain text: users can paste rich content
 * (line breaks, bold, italics, links) inside an editable element.
 * Storing the raw inner HTML preserves that, and we re-inject it
 * verbatim into the new build.
 */
function extractEditableMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!html) return out;
  let m: RegExpExecArray | null;
  // The regex is global; reset its lastIndex defensively.
  EDITABLE_TAG_RE.lastIndex = 0;
  while ((m = EDITABLE_TAG_RE.exec(html)) !== null) {
    const [, , attrs, inner] = m;
    const idMatch = attrs.match(ID_ATTR_RE);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id) continue;
    // Keep the LAST occurrence: rare but possible if a same id
    // appears twice — the user's most-recent edit wins.
    out.set(id, inner);
  }
  return out;
}

/**
 * Replace innerHTML of any tag in `targetHtml` whose id appears in
 * `edits`. Uses a regex per id (rather than scanning once) so a
 * malformed tag elsewhere in the document can't poison every
 * substitution.
 */
function applyEditableMap(targetHtml: string, edits: Map<string, string>): string {
  if (edits.size === 0 || !targetHtml) return targetHtml;
  let out = targetHtml;
  for (const [id, content] of edits) {
    // Match <tag ... id="ID" ...>OLD</tag> — same tag on both sides
    // via backreference. The id can be anywhere in the attribute
    // list; keep the regex strict on the id token boundaries.
    // Escape the id for regex (only [a-zA-Z0-9_-] are valid HTML id
    // chars in our generator, but be defensive).
    const escId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<([a-zA-Z][a-zA-Z0-9]*)\\b([^>]*\\sid\\s*=\\s*["']${escId}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      "i",
    );
    out = out.replace(re, (m, tag, attrs) => `<${tag}${attrs}>${content}</${tag}>`);
  }
  return out;
}

/**
 * Carry the user's inline edits forward across a server-side
 * rebuild. Pass the OLD html_snapshot (the one currently on the
 * row, with all the inline edits) and the freshly rendered
 * candidate; receive a candidate with text content patched back
 * in.
 *
 * No-op fallbacks:
 *   - If oldHtml has no `data-editable` markers, return newHtml as
 *     is (no risk of overwriting AI-only fields).
 *   - If newHtml is empty / falsy, return it unchanged (caller is
 *     expected to handle the build failure case separately).
 */
export function preserveInlineEdits(oldHtml: string | null | undefined, newHtml: string): string {
  if (!newHtml) return newHtml;
  if (!oldHtml || oldHtml.indexOf("data-editable") === -1) return newHtml;
  const edits = extractEditableMap(oldHtml);
  if (edits.size === 0) return newHtml;
  return applyEditableMap(newHtml, edits);
}

// ── Detection helper ───────────────────────────────────────────
// True when the snapshot contains any inline-edit fingerprint —
// useful for callers that want to log / metric / refuse a rebuild
// based on whether the user has customised the page.
export function hasInlineEdits(html: string | null | undefined): boolean {
  if (!html) return false;
  return html.indexOf("data-editable") !== -1;
}
