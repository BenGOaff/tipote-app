// lib/prompts/content/socialPost.ts
// Prompt builder Social Posts — plain text
// ✅ Patch: peut recevoir une offre (pyramide/legacy) OU offerManual pour contextualiser la promo.

export type SocialPlatform = "instagram" | "linkedin" | "tiktok" | "facebook" | "x" | "youtube" | "generic";

export type PromoKind = "paid" | "free";

export type ManualOfferSpecs = {
  name?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  description?: string | null;
  price?: string | null;
  target?: string | null;
  format?: string | null;
  delivery?: string | null;
};

export type OfferContext = {
  id?: string;
  name?: string;
  level?: string | null;
  promise?: string | null;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  target?: string | null;
} | null;

export type SocialPostPromptParams = {
  platform?: SocialPlatform;
  subject: string;
  tone?: string;
  batchCount?: number;
  promoKind?: PromoKind;
  offerLink?: string;

  // ✅ patch
  offer?: OfferContext;
  offerManual?: ManualOfferSpecs | null;
};

function clean(s: unknown, max = 800) {
  const x = typeof s === "string" ? s.trim() : "";
  if (!x) return "";
  return x.length > max ? x.slice(0, max) : x;
}

function priceFromMinMax(price_min: unknown, price_max: unknown): string {
  const min = typeof price_min === "number" ? price_min : null;
  const max = typeof price_max === "number" ? price_max : null;

  if (min == null && max == null) return "";
  if (min != null && max != null) return min === max ? `${min}€` : `${min}–${max}€`;
  return `${(min ?? max) as number}€`;
}

function offerBlock(label: string, offer: OfferContext): string[] {
  if (!offer) return [];
  const out: string[] = [];

  const name = clean(offer.name, 220);
  const level = clean(offer.level, 80);
  const promise = clean(offer.promise, 520);
  const main = clean(offer.main_outcome, 520);
  const desc = clean(offer.description, 900);
  const format = clean(offer.format, 240);
  const delivery = clean(offer.delivery, 240);
  const target = clean(offer.target, 520);
  const price = priceFromMinMax(offer.price_min, offer.price_max);

  out.push(`${label} :`);
  if (name) out.push(`Nom: ${name}`);
  if (level) out.push(`Niveau: ${level}`);
  if (price) out.push(`Prix: ${price}`);
  if (target) out.push(`Public: ${target}`);
  if (promise) out.push(`Promesse: ${promise}`);
  if (main) out.push(`Résultat principal: ${main}`);
  if (format) out.push(`Format: ${format}`);
  if (delivery) out.push(`Livraison: ${delivery}`);
  if (desc) out.push(`Description: ${desc}`);

  return out;
}

function manualOfferBlock(label: string, manual?: ManualOfferSpecs | null): string[] {
  if (!manual) return [];
  const out: string[] = [];

  const name = clean(manual.name, 220);
  const price = clean(manual.price, 120);
  const target = clean(manual.target, 520);
  const promise = clean(manual.promise, 520);
  const main = clean(manual.main_outcome, 520);
  const desc = clean(manual.description, 900);
  const format = clean(manual.format, 240);
  const delivery = clean(manual.delivery, 240);

  if (!name && !promise && !main && !desc && !price && !target) return [];

  out.push(`${label} (manuel) :`);
  if (name) out.push(`Nom: ${name}`);
  if (price) out.push(`Prix: ${price}`);
  if (target) out.push(`Public: ${target}`);
  if (promise) out.push(`Promesse: ${promise}`);
  if (main) out.push(`Résultat principal: ${main}`);
  if (format) out.push(`Format: ${format}`);
  if (delivery) out.push(`Livraison: ${delivery}`);
  if (desc) out.push(`Description: ${desc}`);

  return out;
}

export function buildSocialPostPrompt(params: SocialPostPromptParams): string {
  const platform = (params.platform ?? "generic") as SocialPlatform;
  const subject = clean(params.subject, 320) || "Contenu";
  const tone = clean(params.tone, 120) || "naturel";
  const batchCount = Math.max(1, Math.min(10, Math.floor(params.batchCount ?? 1)));
  const promoKind = (params.promoKind ?? "paid") as PromoKind;
  const offerLink = clean(params.offerLink, 700);

  const lines: string[] = [];

  lines.push("Tu es un copywriter senior spécialisé en contenu social francophone.");
  lines.push("Tu écris en français, texte brut uniquement.");
  lines.push("Phrases courtes. Accroches fortes. Pas de markdown.");
  lines.push("Tu t'appuies sur le persona + le plan + les ressources internes fournis dans le contexte.");
  lines.push("");

  lines.push(`Plateforme: ${platform}.`);
  lines.push(`Ton: ${tone}.`);
  lines.push(`Nombre de posts: ${batchCount}.`);
  lines.push(`Sujet: ${subject}.`);
  lines.push("");

  if (promoKind === "free") {
    lines.push("Type de promo: GRATUIT (lead magnet / ressource).");
  } else {
    lines.push("Type de promo: PAYANT (offre / vente).");
  }

  const offer = params.offer ?? null;
  const manual = params.offerManual ?? null;

  const blocks: string[] = [];
  if (offer) blocks.push(...offerBlock("Offre liée (pyramide/auto)", offer));
  if (!offer && manual) blocks.push(...manualOfferBlock("Offre liée", manual));
  if (blocks.length) {
    lines.push("");
    lines.push(...blocks);
  }

  if (offerLink) {
    lines.push("");
    lines.push("Lien à inclure si pertinent (CTA):");
    lines.push(offerLink);
  }

  lines.push("");
  lines.push("Contraintes:");
  lines.push("- 1 hook très fort au début.");
  lines.push("- 1 idée principale par post.");
  lines.push("- 1 CTA clair (commenter, DM, cliquer, télécharger, etc.).");
  lines.push("- Pas de hashtags en rafale. Si plateforme le justifie, max 3.");
  lines.push("");

  lines.push("Format de sortie attendu:");
  lines.push(`Rends ${batchCount} posts numérotés.`);
  lines.push("Sépare les posts par une ligne contenant uniquement: -----");
  lines.push("Pour chaque post: Hook (1-2 lignes) + corps + CTA.");

  return lines.join("\n");
}
