// Pre-computed selling points for an offer. Generated once via Claude
// from {offer + persona + business profile + storytelling} and reused
// across every content prompt (post, email, article, sales page,
// strategy…). Killing the per-content "explain me the offer + persona"
// reasoning that Claude was redoing on every call.
//
// Storage: embedded in business_profiles.offers[i].sales_arguments
// (JSONB). No new table — keeps the offers list as the single source
// of truth, and the user already edits offers from Settings → Mes
// offres so the sales arguments live exactly where they look for them.
//
// Auto-invalidation: the persona signature is hashed at generation
// time. If the persona later changes, isFresh() returns false and the
// next content generation triggers a regen transparently.

import "server-only";
import crypto from "node:crypto";

export interface SalesArgumentBullet {
  // The benefit promised — concise, one sentence.
  benefit: string;
  // The concrete consequence: what it changes in the user's day-to-day.
  // E.g. "20 min de plus par soir pour ta famille", not "vous gagnez
  // du temps". This is the part that turns abstract benefits into
  // hooks copywriters can actually use.
  consequence: string;
  // Narrative angle to vary across posts (before_after, contrast,
  // metaphor, story, problem_solution, social_proof, contrarian,
  // statistic, question, mistake_to_avoid).
  angle: string;
  // A ready-to-use hook idea so writers don't start from scratch.
  hook_idea: string;
}

export interface SalesArguments {
  generated_at: string; // ISO
  persona_signature: string; // sha256, used to detect persona drift
  offer_signature: string; // sha256 of (name + promise + description)
  model: string;
  bullets: SalesArgumentBullet[];
}

// Stable signature for a persona — only the fields the prompt actually
// uses. Prevents the cache from invalidating on cosmetic edits like a
// changed updated_at timestamp.
export function personaSignature(persona: unknown): string {
  if (!persona || typeof persona !== "object") return "none";
  const p = persona as Record<string, any>;
  const stable = {
    name: p.name ?? null,
    current_situation: p.current_situation ?? null,
    desired_situation: p.desired_situation ?? null,
    pains: p.pains ?? null,
    desires: p.desires ?? null,
    objections: p.objections ?? null,
    awareness_level: p.awareness_level ?? null,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 32);
}

export function offerSignature(offer: unknown): string {
  if (!offer || typeof offer !== "object") return "none";
  const o = offer as Record<string, any>;
  const stable = {
    name: o.name ?? null,
    promise: o.promise ?? null,
    description: o.description ?? null,
    target: o.target ?? null,
    format: o.format ?? null,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 32);
}

export function isFresh(
  args: SalesArguments | null | undefined,
  expectedPersonaSig: string,
  expectedOfferSig: string,
): boolean {
  if (!args) return false;
  if (!Array.isArray(args.bullets) || args.bullets.length === 0) return false;
  return (
    args.persona_signature === expectedPersonaSig &&
    args.offer_signature === expectedOfferSig
  );
}

// Renders the bullets into a compact prompt block. Picked up by the
// content prompt builders so Claude sees pre-distilled selling points
// instead of having to re-derive them from raw offer + persona.
export function formatBulletsForPrompt(args: SalesArguments | null | undefined): string {
  if (!args || !Array.isArray(args.bullets) || args.bullets.length === 0) return "";
  const lines = args.bullets.map((b, i) => {
    const angle = b.angle ? ` [angle: ${b.angle}]` : "";
    const hook = b.hook_idea ? `\n   Idée d'accroche : « ${b.hook_idea} »` : "";
    return `${i + 1}. ${b.benefit} → ${b.consequence}${angle}${hook}`;
  });
  return [
    "ARGUMENTS DE VENTE PRÉ-DISTILLÉS (utilise-en 1-2 par contenu, varie l'angle entre les contenus) :",
    ...lines,
  ].join("\n");
}

const BULLETS_TARGET = 10;

export function buildSalesArgumentsPrompt(args: {
  offer: Record<string, any>;
  persona: unknown;
  storytelling?: string;
  niche?: string;
  mission?: string;
}): { system: string; user: string } {
  const offerLines = [
    `Nom : ${args.offer.name ?? "(sans nom)"}`,
    args.offer.promise ? `Promesse principale : ${args.offer.promise}` : null,
    args.offer.description ? `Description : ${args.offer.description}` : null,
    args.offer.target ? `Cible : ${args.offer.target}` : null,
    args.offer.format ? `Format : ${args.offer.format}` : null,
    args.offer.price ? `Prix : ${args.offer.price}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const personaBlock = args.persona
    ? `PERSONA CLIENT IDÉAL :\n${JSON.stringify(args.persona, null, 2)}`
    : "";
  const storytellingBlock = args.storytelling
    ? `STORYTELLING DU FONDATEUR :\n${args.storytelling}`
    : "";
  const businessBlock = [
    args.niche ? `Niche : ${args.niche}` : null,
    args.mission ? `Mission : ${args.mission}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `Tu es un copywriter senior expert en vente directe et en storytelling. Ton rôle : extraire d'une offre les ${BULLETS_TARGET} arguments de vente les plus puissants, sous forme de puces "bénéfice + conséquence concrète".

RÈGLES :
- Réponds UNIQUEMENT en JSON valide, sans markdown, sans \`\`\`.
- Le JSON doit suivre exactement le schéma demandé.
- Chaque puce a un angle narratif DIFFÉRENT (jamais deux puces avec le même angle).
- Le "benefit" est l'avantage promis, en une phrase claire.
- La "consequence" est la conséquence CONCRÈTE dans le quotidien : pas "tu gagnes du temps" mais "20 min de plus par soir pour ta famille". Toujours tangible.
- Le "hook_idea" est une accroche prête à réutiliser dans un post / email — courte, mordante.
- Adapte le ton au persona (peurs, désirs, niveau de conscience).
- Pas de jargon marketing creux ("révolutionnez", "boostez", "incontournable").`;

  const user = `OFFRE :
${offerLines}

${personaBlock}

${storytellingBlock}

${businessBlock ? `CONTEXTE BUSINESS :\n${businessBlock}\n` : ""}

ANGLES NARRATIFS À VARIER (un par puce — choisis-en ${BULLETS_TARGET} parmi cette liste) :
- before_after : avant/après explicite
- contrast : opposition à la croyance commune
- metaphor : analogie concrète
- story : mini-récit d'usage
- problem_solution : douleur précise → solution
- social_proof : ce que d'autres ont obtenu
- contrarian : à contre-courant des conseils habituels
- statistic : chiffre marquant lié au bénéfice
- question : question qui dérange
- mistake_to_avoid : l'erreur que la cible fait sans le savoir

Réponds AVEC CE JSON EXACT (et rien d'autre) :
{
  "bullets": [
    {
      "benefit": "Le bénéfice en une phrase",
      "consequence": "La conséquence concrète dans le quotidien",
      "angle": "before_after",
      "hook_idea": "Une accroche prête à utiliser, max 12 mots"
    }
    // … 9 autres puces, chacune avec un angle DIFFÉRENT
  ]
}`;

  return { system, user };
}

export function parseSalesArgumentsResponse(raw: string): SalesArgumentBullet[] {
  // Tolerant JSON extraction: model sometimes wraps in ```json or
  // prepends commentary despite the prompt. Take the first {...} block.
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("No JSON object in Claude response");
  }
  const json = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(json?.bullets)) {
    throw new Error("Missing 'bullets' array");
  }
  const out: SalesArgumentBullet[] = [];
  for (const b of json.bullets) {
    if (!b || typeof b !== "object") continue;
    const benefit = String(b.benefit ?? "").trim();
    const consequence = String(b.consequence ?? "").trim();
    if (!benefit || !consequence) continue;
    out.push({
      benefit,
      consequence,
      angle: String(b.angle ?? "").trim() || "story",
      hook_idea: String(b.hook_idea ?? "").trim(),
    });
  }
  if (out.length === 0) throw new Error("No usable bullets in response");
  return out;
}
