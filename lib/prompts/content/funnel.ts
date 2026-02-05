// lib/prompts/content/funnel.ts
// Funnels: page capture / page vente (from_pyramid / from_scratch)
// Objectif: sortir un 1er jet TRÈS QUALITATIF en s’appuyant STRICTEMENT sur les ressources Tipote
// ⚠️ Règles globales :
// - jamais citer "AIDA", "template", "modèle", "structure", "framework"
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

  /**
   * OPTIONNEL (premium rendering):
   * - outputFormat = "contentData_json" => l’IA doit retourner UNIQUEMENT un JSON (contentData)
   * - templateSchemaPrompt = texte décrivant les clés/arrays attendus pour FIT le template choisi
   * - templateId / templateKind uniquement informatifs
   */
  outputFormat?: "text" | "contentData_json";
  templateSchemaPrompt?: string;
  templateId?: string;
  templateKind?: "capture" | "vente";
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

  const target = mode === "from_scratch" ? toOneLine(manual?.target) : "";
  const isLM = mode === "from_pyramid" ? isLikelyLeadMagnet(offer?.level) : true;

  return `
Tu écris le TEXTE COMPLET d’une page de CAPTURE (opt-in), en français.

OBJECTIF UNIQUE :
→ Obtenir une inscription email (prénom + email). Rien d’autre.

Appuye-toi sur la phrase de Blair Warren pour structurer le contenu : encourager les rêves, justifier les échecs, apaiser les peurs, confirmer les soupçons et trouver un « ennemi » à pointer pour se placer du côté du prospect.

RÈGLES ABSOLUES :
- Tu t’appuies OBLIGATOIREMENT sur les ressources Tipote présentes dans le contexte (Tipote Knowledge).
- Tu dois choisir UN exemple de page de capture dans les ressources et t’y conformer de très près :
  - même ordre des sections
  - même rythme
  - même niveau de détail
  - même style de phrases
  - tu adaptes uniquement au thème et à l’offre
- Si plusieurs exemples sont disponibles, choisis celui qui colle le plus au thème.
- Si aucun exemple n’est fourni dans les ressources, applique une version minimaliste premium (mais sans l’indiquer).

INTERDICTIONS :
- Ne jamais mentionner ressource, modèle, template, framework.
- Ne jamais mentionner "AIDA", "template", "modèle", "structure", "framework".
- Pas de vente, pas de paiement, pas de “commande/acheter”.

FORMAT OBLIGATOIRE (sans le nommer) :
- Accroche bénéfice immédiat + spécifique
- Sous-accroche : pour qui + résultat + mécanisme concret
- 3–6 puces orientées gains rapides
- Formulaire : Prénom + Email
- Bouton orienté “recevoir / accéder gratuitement”
- Micro-réassurance (RGPD / pas de spam)
- Mini “pour qui / pas pour qui”
- Rappel CTA final

CONTEXTE (ne pas recopier) :
- Thème : ${theme || "Page de capture"}
- Mode : ${mode}
- Offre (pyramide) : ${offerToCompactJson(offer)}
- Infos manuelles : ${manualToCompactJson(manual)}

DONNÉES CLÉS :
- Nom : ${offerName || "(non fourni)"}
- Promesse : ${promise || "(non fournie)"}
${mode === "from_scratch" ? `- Cible : ${target || "(non fourni)"}` : ""}

Ton : premium, direct, concret. Zéro blabla, zéro promesse irréaliste.
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
Tu écris le TEXTE COMPLET d’une PAGE DE VENTE HIGH TICKET, en français, conçue pour convertir.

Appuye-toi sur la phrase de Blair Warren pour structurer le contenu : encourager les rêves, justifier les échecs, apaiser les peurs, confirmer les soupçons et trouver un « ennemi » à pointer pour se placer du côté du prospect.

POINT CLÉ :
👉 Une page de vente N’EST PAS une page de capture.

INTERDICTIONS ABSOLUES (vente) :
- AUCUN formulaire email.
- AUCUN champ prénom/email.
- AUCUNE phrase “inscris-toi”, “reçois gratuitement”, “télécharge”.
- PAS de lead magnet, PAS d’opt-in.
- Ne jamais mentionner ressource, modèle, template, framework.
- Ne jamais écrire "AIDA", "template", "modèle", "structure", "framework".
- Ne jamais inventer témoignages, chiffres, logos, résultats.

OBLIGATION “TEMPLATE LOCK” (TRÈS IMPORTANT) :
- Tu DOIS choisir UN template / exemple de page de vente présent dans les ressources Tipote (Tipote Knowledge).
- Tu dois t’y conformer de très près :
  - même ordre des sections
  - mêmes types d’arguments
  - même style et rythme
  - même densité
  - tu adaptes UNIQUEMENT au thème + à l’offre + au persona
- Si plusieurs templates existent, choisis celui qui ressemble le plus à une page high ticket.
- Si aucun template n’est présent dans les ressources, tu utilises une structure premium “classique” (sans l’indiquer), en restant dense et décisionnelle.

TRAVAIL INTERNE (SILENCIEUX, NON AFFICHÉ) :
Avant d’écrire, tu dois clarifier :
- l’ANGLE principal
- le MÉCANISME différenciant (1 seul, clair)
- au moins 3 objections avancées
- une preuve logique disponible (process, livrable, contraintes, méthode, périmètre)

EXIGENCE DE LONGUEUR :
- Page volontairement détaillée.
- Chaque section doit apporter un élément NOUVEAU à la décision.
- Aucun remplissage, aucune répétition.

CTA AUTORISÉS (transactionnels) :
- Accéder
- Commander
- Acheter
- Rejoindre
- Démarrer maintenant

CONTENU À COUVRIR (sans titres techniques) :
- Ouverture forte : promesse + cible + mécanisme
- Problème réel + coût de l’inaction (niveau conscient)
- Pourquoi les solutions habituelles échouent à ce stade
- Présentation de l’approche + mécanisme (comment ça marche)
- Ce que l’acheteur obtient exactement (livrables / accès / périmètre)
- Ce que l’offre ne fait pas (clarification premium)
- Pour qui / pas pour qui
- Objections + réponses argumentées
- Pourquoi maintenant
- Garantie (si fournie)
- Urgence (si fournie)
- FAQ utile (6–10 Q/R)
- CTA répétés (sans formulaire)

DONNÉES À UTILISER :
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

Ton : expert, posé, décisionnel. On doit sentir un moment de choix.
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                         PREMIUM: contentData JSON FIT                        */
/* -------------------------------------------------------------------------- */

function buildPremiumJsonPrompt(params: FunnelPromptParams): string {
  const { mode, theme, offer, manual, page, templateSchemaPrompt } = params;

  const offerName =
    mode === "from_pyramid"
      ? toOneLine(offer?.name)
      : toOneLine(manual?.name) || toOneLine(offer?.name);

  const promise =
    mode === "from_pyramid"
      ? toOneLine(offer?.promise)
      : toOneLine(manual?.promise) || toOneLine(offer?.promise);

  const target = mode === "from_scratch" ? toOneLine(manual?.target) : "";
  const isLM = mode === "from_pyramid" ? isLikelyLeadMagnet(offer?.level) : true;

  const context = {
    page,
    theme: toOneLine(theme),
    offerName,
    promise,
    target,
    isLeadMagnet: isLM,
    offer: offer ? JSON.parse(offerToCompactJson(offer)) : null,
    manual: manual ? JSON.parse(manualToCompactJson(manual)) : null,
  };

  return `
Tu es un copywriter senior premium.
Tu écris en français.

CONTEXTE (JSON) :
${JSON.stringify(context, null, 2)}

OBJECTIF :
- Produire le contentData (JSON) qui remplit la page ${page === "sales" ? "de vente" : "de capture"}.
- Le texte DOIT être adapté à l'offre et au thème, et être lisible, concret, très premium.

INTERDICTIONS :
- Ne jamais mentionner ressource, modèle, template, framework.
- Pas de markdown. Pas de HTML.
- Pas d’explications. Pas de méta.

IMPORTANT :
- Le rendu final doit être court, rythmé, très clair.
- Une promesse forte, des bénéfices concrets, CTA irrésistible.
- Si page capture: focus inscription email (gratuit). Si page vente: focus conversion.

SCHÉMA À RESPECTER STRICTEMENT :
${templateSchemaPrompt || ""}

RENDU :
Retourne UNIQUEMENT l'objet JSON final (sans texte autour).
`.trim();
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  const wantsJson =
    params.outputFormat === "contentData_json" &&
    typeof params.templateSchemaPrompt === "string" &&
    params.templateSchemaPrompt.trim().length > 0;

  if (wantsJson) return buildPremiumJsonPrompt(params);

  return params.page === "sales" ? buildSalesPrompt(params) : buildCapturePrompt(params);
}
