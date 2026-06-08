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

/** Strip em/en dashes from AI output. Rule absolue Béné 7 juin 2026 :
 *  aucun em-dash ni en-dash ne doit survivre dans du contenu user-visible
 *  car c'est la signature stylistique #1 des LLM. On préserve les hyphens
 *  simples user-typed (-) et les ranges numériques ("2024-2026").
 *
 *  3 passes du plus precis au plus brut, pour gerer tous les cas sans
 *  laisser une seule occurrence passer : */
export function stripEmDashes(input: string): string {
  if (!input) return input;
  let out = input;
  // 1. " — " ou " – " avec espaces → ", " (cas incise typique IA)
  out = out.replace(/\s+[—–]\s+/g, ", ");
  // 2. Em/en dash colle entre 2 mots ("mot—mot") → "mot, mot"
  out = out.replace(/([A-Za-zÀ-ÿ0-9)])[—–]([A-Za-zÀ-ÿ(])/g, "$1, $2");
  // 3. Em dash en debut de ligne ("— phrase") → liste bullet "- phrase"
  out = out.replace(/(^|\n)\s*[—–]\s+/g, "$1- ");
  // 4. CATCH-ALL : toute occurrence restante (em-dash isole, repete,
  //    colle de facon bizarre) → simple hyphen avec espace propre.
  //    Cette ligne garantit qu'aucun em-dash ne survit jamais.
  out = out.replace(/[—–]+/g, "-");
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
