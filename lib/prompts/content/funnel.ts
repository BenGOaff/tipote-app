// lib/prompts/content/funnel.ts
// Funnels: page capture / page vente (from_pyramid / from_scratch)
// Objectif: pages NETTEMENT différenciées capture vs vente, qualité premium
// ⚠️ Règles globales :
// - jamais citer AIDA / template / framework
// - jamais expliquer le raisonnement
// - retourner UNIQUEMENT le texte final visible

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
  offer: PyramidOfferContext | null;
  manual: FunnelManual | null;
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
  return JSON.stringify({
    name: offer.name ?? null,
    level: offer.level ?? null,
    promise: offer.promise ?? null,
    description: offer.description ?? null,
    main_outcome: offer.main_outcome ?? null,
    price_min: offer.price_min ?? null,
    price_max: offer.price_max ?? null,
    format: offer.format ?? null,
    delivery: offer.delivery ?? null,
  });
}

function manualToCompactJson(manual: FunnelManual | null): string {
  if (!manual) return "null";
  return JSON.stringify({
    name: manual.name ?? null,
    promise: manual.promise ?? null,
    target: manual.target ?? null,
    price: manual.price ?? null,
    urgency: manual.urgency ?? null,
    guarantee: manual.guarantee ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/*                                    CAPTURE                                 */
/* -------------------------------------------------------------------------- */

function buildCapturePrompt(params: FunnelPromptParams): string {
  const { mode, theme, offer, manual } = params;

  const offerName =
    mode === "from_pyramid"
      ? toOneLine(offer?.name)
      : toOneLine(manual?.name) || toOneLine(offer?.name);

  const promise =
    mode === "from_pyramid"
      ? toOneLine(offer?.promise)
      : toOneLine(manual?.promise) || toOneLine(offer?.promise);

  const target =
    mode === "from_scratch" ? toOneLine(manual?.target) : "";

  const isLM = mode === "from_pyramid" ? isLikelyLeadMagnet(offer?.level) : true;

  return `
Tu écris le TEXTE COMPLET d’une page de CAPTURE (opt-in).

OBJECTIF UNIQUE :
→ Obtenir une inscription email (prénom + email).

INTERDICTIONS ABSOLUES :
- Pas de vente.
- Pas de paiement.
- Pas de décision engageante.
- Pas de “commande”, “achat”, “accès payant”.

FORMAT OBLIGATOIRE :
- Accroche bénéfice immédiat
- Sous-accroche (pour qui + résultat)
- 3–6 puces orientées gains rapides
- Formulaire (Prénom / Email)
- Bouton orienté “recevoir / accéder gratuitement”
- Micro-réassurance
- Mini “pour qui / pas pour qui”

CONTEXTE :
- Thème : ${theme}
- Offre : ${offerName}
- Promesse : ${promise}
${mode === "from_scratch" ? `- Cible : ${target}` : ""}

Ton : clair, simple, non agressif.
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                                     VENTE                                  */
/* -------------------------------------------------------------------------- */

function buildSalesPrompt(params: FunnelPromptParams): string {
  const { mode, theme, offer, manual } = params;

  const offerName =
    mode === "from_pyramid"
      ? toOneLine(offer?.name)
      : toOneLine(manual?.name) || toOneLine(offer?.name);

  const promise =
    mode === "from_pyramid"
      ? toOneLine(offer?.promise)
      : toOneLine(manual?.promise) || toOneLine(offer?.promise);

  const desc = safeStr(offer?.description);
  const mainOutcome = toOneLine(offer?.main_outcome);

  const priceMin = offer?.price_min;
  const priceMax = offer?.price_max;

  const priceScratch = toOneLine(manual?.price);
  const urgency = toOneLine(manual?.urgency);
  const guarantee = toOneLine(manual?.guarantee);

  return `
Tu écris le TEXTE COMPLET d’une PAGE DE VENTE.

C’EST CRITIQUE :
👉 Une page de vente N’EST PAS une page de capture.

INTERDICTIONS ABSOLUES (vente) :
- AUCUN formulaire email.
- AUCUN champ prénom / email.
- AUCUNE phrase de type “inscris-toi”, “reçois gratuitement”.
- PAS de lead magnet.
- PAS de tunnel d’opt-in.

CTA AUTORISÉS :
- “Accéder”
- “Commander”
- “Acheter”
- “Installer maintenant”
- “Passer à l’action”

RÈGLE MAJEURE :
Avant d’écrire, tu DOIS raisonner silencieusement pour définir :
- l’ANGLE principal
- le MÉCANISME unique
- 2 objections réelles
- une preuve logique (process, livrable, contrainte)

STRUCTURE ATTENDUE :
- Ouverture très forte (promesse + cible + mécanisme)
- Problème réel + frustration
- Pourquoi les solutions classiques échouent
- Présentation de l’offre + mécanisme
- Ce que l’acheteur obtient concrètement
- Pour qui / pas pour qui
- Objections + réponses
- Garantie (si fournie)
- Urgence (si fournie)
- FAQ utile
- CTA clair et répété (sans formulaire)

DONNÉES :
- Nom : ${offerName}
- Promesse : ${promise}
${desc ? `- Description : ${desc}` : ""}
${mainOutcome ? `- Résultat principal : ${mainOutcome}` : ""}
${
  mode === "from_pyramid"
    ? `- Prix indicatif : min=${String(priceMin ?? "")} max=${String(priceMax ?? "")}`
    : `- Prix : ${priceScratch || "(non fourni)"}`
}
${urgency ? `- Urgence : ${urgency}` : ""}
${guarantee ? `- Garantie : ${guarantee}` : ""}

Ton : direct, assumé, décisionnel.
On doit sentir un MOMENT DE CHOIX.
`.trim();
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  return params.page === "sales"
    ? buildSalesPrompt(params)
    : buildCapturePrompt(params);
}
