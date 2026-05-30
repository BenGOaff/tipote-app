// lib/aiTextSanitizer.ts
// Belt-and-suspenders post-processor for AI-generated text. The prompts
// already include NATURAL_WRITING_BLOCK to ban "AI tics" (em dashes,
// triadic parallelisms, brochure verbs…) but models still leak them
// sometimes. We strip the cheapest-to-detect ones here so the creator
// never sees them in a generated quiz / sondage / reformulation.
//
// Rules are intentionally conservative — we only touch things that are
// almost certainly AI noise (typographic em dashes in incise, double
// em-dashes, leading sparkle emojis). We DO NOT rewrite phrases, we
// DO NOT change meaning.

/** Replace em / en dashes used in incise by commas. Preserves user-typed
 *  hyphens (-) and dashes in numeric ranges (e.g. "2024-2026"). */
export function stripEmDashes(input: string): string {
  if (!input) return input;
  let out = input;
  // " — " or " – " (with spaces) → ", " — typical AI "incise" pattern.
  out = out.replace(/\s+[—–]\s+/g, ", ");
  // Em / en dash glued without spaces between two words ("mot—mot") → "mot, mot".
  out = out.replace(/([A-Za-zÀ-ÿ0-9)])[—–]([A-Za-zÀ-ÿ(])/g, "$1, $2");
  // Stray em dash at start of a line ("— phrase").
  out = out.replace(/(^|\n)\s*[—–]\s+/g, "$1");
  return out;
}

/** Strip decorative emojis the model loves to drop at the start of
 *  generated copy (sparkle, fire, lightning, rocket…) without touching
 *  emojis the user might have legitimately included mid-sentence. */
export function stripLeadingDecorativeEmojis(input: string): string {
  if (!input) return input;
  // Common AI decorative leaders.
  const LEADERS = /^[\s]*(?:✨|🔥|⚡|🚀|💡|🎯|🌟|👉|👇|✅|💎)+\s*/u;
  return input.replace(LEADERS, "");
}

/** Collapse "ce n'est pas X, c'est Y" / "il ne s'agit pas de X, mais Y"
 *  contrastive patterns is HARD to do safely with regex — skip it; the
 *  prompt already bans the pattern at the model level. */

/** Master sanitizer applied to free-text AI outputs (titles, descriptions,
 *  intros, CTAs, reformulations). Safe to call multiple times. */
export function sanitizeAiText(input: string): string {
  if (typeof input !== "string") return input;
  let out = input;
  out = stripEmDashes(out);
  out = stripLeadingDecorativeEmojis(out);
  // Collapse runs of spaces introduced by the comma substitutions above.
  out = out.replace(/ {2,}/g, " ");
  // Trim space immediately before French punctuation that the renderer
  // will re-NBSP later (`lib/quizPersonalization.ts`).
  out = out.replace(/ +([,.;:!?»)])/g, "$1");
  return out.trim();
}

/** Deep-sanitize a parsed quiz/sondage JSON. Walks all known string
 *  fields and rewrites them in place. Returns a NEW object — caller
 *  keeps the original AI response untouched for debugging. */
export function sanitizeAiQuizPayload<T extends Record<string, unknown>>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  const STRING_KEYS = new Set([
    "title", "introduction", "question_text", "text", "description",
    "insight", "projection", "cta_text", "share_message", "tag",
  ]);
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return sanitizeAiText(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = STRING_KEYS.has(k) && typeof v === "string"
          ? sanitizeAiText(v)
          : walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(payload) as T;
}
