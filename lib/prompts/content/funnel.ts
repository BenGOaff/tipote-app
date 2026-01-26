// lib/prompts/content/funnel.ts
// Funnels: page capture / page vente (from_pyramid / from_scratch)
// Objectif: sortir un 1er jet très haut niveau en s’inspirant OBLIGATOIREMENT des ressources Tipote
// ⚠️ Garde-fous: ne jamais citer "AIDA", "template", "modèle", "structure", "framework".
// ⚠️ Capture: pas de "modules", pas de programme, pas de bonus inventés (sauf si offert explicitement).
// ⚠️ Vente: peut avoir sections complètes, mais uniquement cohérentes avec l’offre et ses données.

export type FunnelPage = "capture" | "sales";
export type FunnelMode = "from_pyramid" | "from_scratch";

export type FunnelManual = {
  name: string | null;
  promise: string | null;
  target: string | null;
  price?: string | null;
  urgency?: string | null;
  guarantee?: string | null;
};

export type PyramidOfferContext = {
  id?: string;
  name?: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  price_min?: any;
  price_max?: any;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  updated_at?: string | null;
};

export type FunnelPromptParams = {
  page: FunnelPage;
  mode: FunnelMode;
  theme: string;
  offer: PyramidOfferContext | null; // from_pyramid
  manual: FunnelManual | null; // from_scratch
  language?: "fr";
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toOneLine(v: unknown): string {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function isLikelyLeadMagnet(level: unknown) {
  const s = toOneLine(level).toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

function offerToCompactJson(offer: PyramidOfferContext | null): string {
  if (!offer) return "null";
  const obj = {
    id: offer.id ?? undefined,
    name: offer.name ?? null,
    level: offer.level ?? null,
    promise: offer.promise ?? null,
    description: offer.description ?? null,
    main_outcome: offer.main_outcome ?? null,
    price_min: offer.price_min ?? null,
    price_max: offer.price_max ?? null,
    format: offer.format ?? null,
    delivery: offer.delivery ?? null,
  };
  return JSON.stringify(obj);
}

function manualToCompactJson(manual: FunnelManual | null): string {
  if (!manual) return "null";
  const obj = {
    name: manual.name ?? null,
    promise: manual.promise ?? null,
    target: manual.target ?? null,
    price: manual.price ?? null,
    urgency: manual.urgency ?? null,
    guarantee: manual.guarantee ?? null,
  };
  return JSON.stringify(obj);
}

function buildCapturePrompt(params: FunnelPromptParams): string {
  const { mode, theme, offer, manual } = params;

  const offerName =
    mode === "from_pyramid" ? toOneLine(offer?.name) : toOneLine(manual?.name) || toOneLine(offer?.name);
  const promise =
    mode === "from_pyramid" ? toOneLine(offer?.promise) : toOneLine(manual?.promise) || toOneLine(offer?.promise);
  const target =
    mode === "from_pyramid" ? "" : toOneLine(manual?.target); // utile only scratch

  const isLM = mode === "from_pyramid" ? isLikelyLeadMagnet(offer?.level) : true;

  // ⚠️ Capture: on évite “modules/bonus/programme”
  return `
Tu dois écrire le TEXTE COMPLET d’une page de capture (opt-in) en français, optimisée conversion.

IMPÉRATIF :
- Tu DOIS t’inspirer des ressources Tipote fournies dans le contexte (Tipote Knowledge). 
- Tu dois produire directement une excellente version dès le premier jet.
- Tu n’as PAS le droit de mentionner que tu utilises une ressource, un modèle, un template ou une structure.
- Tu n’as PAS le droit d’écrire les mots: "AIDA", "template", "modèle", "structure", "framework", "copywriting formula".
- Tu retournes uniquement le texte final de la page (texte brut), sans explication, sans titres techniques internes.

CONTEXTE (ne pas répéter tel quel) :
- Objectif / thème : ${theme || "Page de capture"}
- Mode : ${mode}
- Offre (si pyramide) : ${offerToCompactJson(offer)}
- Infos manuelles (si zéro) : ${manualToCompactJson(manual)}

RÈGLES CRITIQUES (CAPTURE) :
- Une page de capture sert à obtenir un email (et éventuellement prénom). Point.
- Ne crée PAS de "modules", "programme", "bonus", "curriculum", "chapitres" si ce n’est pas explicitement fourni.
- Ne promets pas une transformation disproportionnée par rapport à un lead magnet simple.
- Si c’est un lead magnet (probable = ${String(isLM)}), reste simple, direct, orienté bénéfice immédiat.
- Mets 1 seul objectif : inscription.

FORMAT ATTENDU (sans le nommer) :
- En-tête fort (bénéfice principal + spécificité)
- Sous-titre (clarifie pour qui + résultat + mécanisme)
- Puces orientées résultats (3 à 6 max)
- Bloc formulaire (placeholders "Prénom", "Email") + texte bouton
- Micro-réassurance (RGPD, pas de spam)
- Petit bloc "Pour qui / pas pour qui" (très court)
- Rappel CTA final (court)

DONNÉES À UTILISER :
- Nom de l’offre / ressource : ${offerName || "(non fourni)"} 
- Promesse principale : ${promise || "(non fournie)"} 
${mode === "from_scratch" ? `- Public cible : ${target || "(non fourni)"}` : ""}

Ton : clair, premium, concret, pas de blabla.
Évite les généralités. Fais des formulations spécifiques.
`.trim();
}

function buildSalesPrompt(params: FunnelPromptParams): string {
  const { mode, theme, offer, manual } = params;

  const offerName =
    mode === "from_pyramid" ? toOneLine(offer?.name) : toOneLine(manual?.name) || toOneLine(offer?.name);
  const promise =
    mode === "from_pyramid" ? toOneLine(offer?.promise) : toOneLine(manual?.promise) || toOneLine(offer?.promise);
  const desc = mode === "from_pyramid" ? safeStr(offer?.description) : "";
  const mainOutcome = mode === "from_pyramid" ? toOneLine(offer?.main_outcome) : "";

  const priceMin = mode === "from_pyramid" ? offer?.price_min : null;
  const priceMax = mode === "from_pyramid" ? offer?.price_max : null;

  const priceScratch = toOneLine(manual?.price);
  const urgency = toOneLine(manual?.urgency) || "";
  const guarantee = toOneLine(manual?.guarantee) || "";

  return `
Tu dois écrire le TEXTE COMPLET d’une page de vente en français, optimisée conversion.

IMPÉRATIF :
- Tu DOIS t’inspirer des ressources Tipote fournies dans le contexte (Tipote Knowledge).
- Pour les pages de vente, tu dois coller au plus près des exemples/templates de pages de vente présents dans les ressources (sans jamais les citer).
- Tu n’as PAS le droit de mentionner que tu utilises une ressource, un modèle, un template ou une structure.
- Tu n’as PAS le droit d’écrire les mots: "AIDA", "template", "modèle", "structure", "framework", "copywriting formula".
- Tu retournes uniquement le texte final (texte brut), sans explication, sans markdown.

CONTEXTE (ne pas répéter tel quel) :
- Objectif / thème : ${theme || "Page de vente"}
- Mode : ${mode}
- Offre (si pyramide) : ${offerToCompactJson(offer)}
- Infos manuelles (si zéro) : ${manualToCompactJson(manual)}

RÈGLES CRITIQUES (VENTE) :
- Ne jamais inventer des éléments factuels (témoignages, chiffres, logos, résultats) si on ne te les a pas donnés.
- Si l’offre est un outil / agent IA (et pas une formation), ne crée PAS de “modules de formation”. 
  Tu peux décrire: fonctionnalités, cas d’usage, livrables, onboarding, support, limites, garanties.
- Si prix inconnu: propose une formulation neutre (ex: "accès immédiat" + CTA), mais évite un montant.
- Si prix fourni: intègre-le clairement + CTA.
- Urgence et garantie: uniquement si fournies (mode zéro) ou si présentes dans l’offre (pyramide).

ÉLÉMENTS À COUVRIR (sans titres techniques) :
- HERO puissant (promesse + pour qui + mécanisme)
- Problème / frustration + coût de l’inaction
- Solution + pourquoi ça marche (mécanisme)
- Ce que l’acheteur obtient (livrables / accès / fonctionnalités) — pas de programme inventé
- Pour qui / pas pour qui
- Objections + réponses
- Garantie (si fournie)
- Urgence / bonus (si fournis)
- FAQ (5-8 Q/R utiles)
- CTA répétés

DONNÉES À UTILISER :
- Nom : ${offerName || "(non fourni)"}
- Promesse : ${promise || "(non fournie)"}
${desc ? `- Description : ${desc}` : ""}
${mainOutcome ? `- Résultat principal : ${mainOutcome}` : ""}
${
  mode === "from_pyramid"
    ? `- Prix (pyramide) : min=${String(priceMin ?? "")} max=${String(priceMax ?? "")}`
    : `- Prix (manuel) : ${priceScratch || "(non fourni)"}`
}
${mode === "from_scratch" && urgency ? `- Urgence : ${urgency}` : ""}
${mode === "from_scratch" && guarantee ? `- Garantie : ${guarantee}` : ""}

Ton : direct, premium, spécifique, orienté bénéfices + preuves logiques.
`.trim();
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  const page = params.page === "sales" ? "sales" : "capture";
  return page === "sales" ? buildSalesPrompt(params) : buildCapturePrompt(params);
}
