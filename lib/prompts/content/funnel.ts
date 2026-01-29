// lib/prompts/content/funnel.ts
// Funnels: page capture / page vente (from_pyramid / from_scratch)
// Objectif: sortir un 1er jet TRÈS QUALITATIF en s’appuyant STRICTEMENT sur les ressources Tipote
// ⚠️ Garde-fous globaux:
// - ne jamais citer "AIDA", "template", "modèle", "structure", "framework"
// - ne jamais expliquer ce que tu fais
// - retourner UNIQUEMENT le texte final visible par l’utilisateur

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
Tu écris le TEXTE COMPLET d’une page de capture (opt-in), en français, orientée conversion.

RÈGLES ABSOLUES :
- Tu t’inspires OBLIGATOIREMENT des ressources Tipote présentes dans le contexte.
- Tu livres une version directement publiable, sans expliquer ton raisonnement.
- Tu n’emploies JAMAIS les mots : "AIDA", "template", "modèle", "structure", "framework".
- Tu retournes uniquement le texte final, sans titres techniques ni commentaires.

CONTEXTE (ne pas recopier tel quel) :
- Thème / objectif : ${theme || "Page de capture"}
- Mode : ${mode}
- Offre (pyramide) : ${offerToCompactJson(offer)}
- Infos manuelles : ${manualToCompactJson(manual)}

RÈGLES CAPTURE :
- Objectif unique : obtenir une inscription email (prénom + email).
- N’invente PAS de modules, programme, bonus ou système complexe.
- Si lead magnet (= ${String(isLM)}), promesse simple, rapide, crédible.
- Une seule promesse centrale, très claire.

FORMAT ATTENDU (sans le nommer) :
- Accroche très spécifique orientée bénéfice immédiat
- Sous-accroche : pour qui + résultat + mécanisme concret
- 3 à 6 puces ultra concrètes (résultats / situations)
- Bloc formulaire (Prénom / Email) + CTA clair
- Micro-réassurance (RGPD / pas de spam)
- Mini bloc “pour qui / pas pour qui”
- Rappel CTA final

DONNÉES CLÉS :
- Nom : ${offerName || "(non fourni)"}
- Promesse : ${promise || "(non fournie)"}
${mode === "from_scratch" ? `- Cible : ${target || "(non fournie)"}` : ""}

Ton : premium, direct, précis. Zéro blabla.
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
Tu écris le TEXTE COMPLET d’une page de vente, en français, conçue pour convertir.

RÈGLE MAJEURE :
Avant d’écrire la page, tu DOIS raisonner SILENCIEUSEMENT (ne rien afficher) pour définir :
- l’ANGLE principal de la page
- le MÉCANISME unique qui rend l’offre crédible
- les 2 OBJECTIONS majeures du prospect
- la PREUVE logique disponible (process, expérience, livrable, contrainte)

Une fois ces éléments clairs, tu écris la page en les utilisant EXPLICITEMENT dans le texte.

INTERDICTIONS :
- Ne jamais mentionner ressource, modèle, template, framework.
- Ne jamais écrire de phrases génériques type “clé en main”, “sans prise de tête”.
- Ne jamais inventer témoignages, chiffres, logos ou résultats factuels.

CONTEXTE (ne pas recopier) :
- Thème : ${theme || "Page de vente"}
- Mode : ${mode}
- Offre (pyramide) : ${offerToCompactJson(offer)}
- Infos manuelles : ${manualToCompactJson(manual)}

CONTRAINTES OFFRE :
- Si outil / service / IA : PAS de modules ou programme fictif.
- Décris uniquement ce qui est livré, comment, pour quel usage.
- Si prix inconnu : CTA neutre.
- Urgence / garantie UNIQUEMENT si fournies.

ÉLÉMENTS À COUVRIR (sans titres techniques) :
- Ouverture forte : promesse + cible + mécanisme
- Problème vécu + coût de l’inaction
- Présentation de la solution + pourquoi elle fonctionne
- Ce que l’acheteur obtient concrètement
- Pour qui / pas pour qui
- Objections + réponses
- Garantie (si fournie)
- Urgence (si fournie)
- FAQ utile (5–8 questions)
- CTA répétés et cohérents

DONNÉES CLÉS :
- Nom : ${offerName || "(non fourni)"}
- Promesse : ${promise || "(non fournie)"}
${desc ? `- Description : ${desc}` : ""}
${mainOutcome ? `- Résultat principal : ${mainOutcome}` : ""}
${
  mode === "from_pyramid"
    ? `- Prix indicatif : min=${String(priceMin ?? "")} max=${String(priceMax ?? "")}`
    : `- Prix : ${priceScratch || "(non fourni)"}`
}
${urgency ? `- Urgence : ${urgency}` : ""}
${guarantee ? `- Garantie : ${guarantee}` : ""}

Ton : stratégique, incarné, précis. Chaque phrase doit servir la décision.
`.trim();
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  return params.page === "sales"
    ? buildSalesPrompt(params)
    : buildCapturePrompt(params);
}
