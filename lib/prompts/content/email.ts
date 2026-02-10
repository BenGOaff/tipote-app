// lib/prompts/content/email.ts
// Builder prompt Email (plain text) — copywriter expert
// Objectif: produire des emails très convertissants en FR, en s'appuyant sur persona/plan/knowledge injectés côté API.
// PATCH (2026-01):
// - Offre enrichie (target/public, format, delivery, prix) + résumé plus exploitable par l’IA
// - Onboarding KLT: support explicite du lead magnet (offre existante ou manuel) + consignes "envoi + KLT 3"
// - Backward compatible: continue d’accepter offer/offerManual comme avant

export type emailType = "newsletter" | "sales_single" | "sales_sequence_7" | "onboarding_klt_3";

export type ManualOfferSpecs = {
  name?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  description?: string | null;
  price?: string | null;

  // bonus (si dispo)
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

  // ✅ important pour “public etc”
  target?: string | null; // audience / public
};

export type EmailPromptParams = {
  type: emailType;
  formality?: "tu" | "vous";

  // Newsletter
  theme?: string;
  cta?: string;

  // Vente
  subject?: string; // intention/angle
  offer?: OfferContext | null;
  offerManual?: ManualOfferSpecs | null;
  offerLink?: string | null;

  // Onboarding
  leadMagnetLink?: string | null;
  onboardingCta?: string | null;

  /**
   * ✅ Onboarding amélioré: si tu veux passer une offre dédiée au lead magnet,
   * tu peux l’envoyer ici. (Sinon on retombe sur offer / offerManual comme avant.)
   */
  leadMagnet?: OfferContext | null;
  leadMagnetManual?: ManualOfferSpecs | null;
};

function clean(s: unknown, max = 1200) {
  const x = typeof s === "string" ? s.trim() : "";
  if (!x) return "";
  return x.length > max ? x.slice(0, max) : x;
}

function formatPriceFromMinMax(priceMin: number | null, priceMax: number | null): string {
  if (priceMin === null && priceMax === null) return "";
  if (priceMin !== null && priceMax !== null) return priceMin === priceMax ? `${priceMin}€` : `${priceMin}–${priceMax}€`;
  if (priceMin !== null) return `${priceMin}€`;
  if (priceMax !== null) return `${priceMax}€`;
  return "";
}

function isLeadMagnetLevel(level: unknown): boolean {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

function offerSummaryBlock(args: {
  label: string;
  offer?: OfferContext | null;
  manual?: ManualOfferSpecs | null;
}): string[] {
  const { label, offer, manual } = args;
  const out: string[] = [];

  if (offer) {
    const offerName = clean(offer.name, 220);
    const offerLevel = clean(offer.level, 80);
    const promise = clean(offer.promise, 600);
    const description = clean(offer.description, 1400);
    const mainOutcome = clean(offer.main_outcome, 600);
    const format = clean(offer.format, 300);
    const delivery = clean(offer.delivery, 300);
    const target = clean(offer.target, 600);
    const priceMin = typeof offer.price_min === "number" ? offer.price_min : null;
    const priceMax = typeof offer.price_max === "number" ? offer.price_max : null;
    const price = formatPriceFromMinMax(priceMin, priceMax);

    out.push(`${label} (importée automatiquement) :`);
    if (offerName) out.push(`Nom: ${offerName}`);
    if (offerLevel) out.push(`Niveau: ${offerLevel}`);
    if (price) out.push(`Prix: ${price}`);
    if (promise) out.push(`Promesse: ${promise}`);
    if (mainOutcome) out.push(`Résultat principal: ${mainOutcome}`);
    if (target) out.push(`Public: ${target}`);
    if (format) out.push(`Format: ${format}`);
    if (delivery) out.push(`Livraison: ${delivery}`);
    if (description) out.push(`Description: ${description}`);
    return out;
  }

  if (manual) {
    const name = clean(manual.name, 220);
    const promise = clean(manual.promise, 600);
    const mainOutcome = clean(manual.main_outcome, 600);
    const description = clean(manual.description, 1400);
    const price = clean(manual.price, 120);
    const target = clean(manual.target, 600);
    const format = clean(manual.format, 300);
    const delivery = clean(manual.delivery, 300);

    out.push(`${label} (spécificités saisies manuellement) :`);
    if (name) out.push(`Nom: ${name}`);
    if (price) out.push(`Prix: ${price}`);
    if (promise) out.push(`Promesse: ${promise}`);
    if (mainOutcome) out.push(`Résultat principal: ${mainOutcome}`);
    if (target) out.push(`Public: ${target}`);
    if (format) out.push(`Format: ${format}`);
    if (delivery) out.push(`Livraison: ${delivery}`);
    if (description) out.push(`Description: ${description}`);
    return out;
  }

  return out;
}

function resolveLeadMagnet(params: EmailPromptParams): { offer?: OfferContext | null; manual?: ManualOfferSpecs | null } {
  // 1) explicit fields (new)
  if (params.leadMagnet || params.leadMagnetManual) {
    return { offer: params.leadMagnet ?? null, manual: params.leadMagnetManual ?? null };
  }

  // 2) backward compatible: certains fronts envoient offerManual pour onboarding
  // ou offer si l’offre sélectionnée est un lead magnet.
  const offer = params.offer ?? null;
  const manual = params.offerManual ?? null;

  if (offer && isLeadMagnetLevel(offer.level)) return { offer, manual: null };
  if (manual) return { offer: null, manual };

  return { offer: null, manual: null };
}

export function buildEmailPrompt(params: EmailPromptParams): string {
  const type = params.type;
  const formality = params.formality === "tu" ? "tu" : "vous";

  const theme = clean(params.theme, 240);
  const cta = clean(params.cta, 300);

  const subject = clean(params.subject, 260);
  const offerLink = clean(params.offerLink, 700) || "";

  const leadMagnetLink = clean(params.leadMagnetLink, 900) || "";
  const onboardingCta = clean(params.onboardingCta, 320) || "";

  const lines: string[] = [];

  // System-style instructions (strict plain text)
  lines.push("Tu es un copywriter senior spécialisé en email marketing pour entrepreneurs francophones.");
  lines.push("Tu maîtrises les meilleures pratiques 2025 (angles, hooks, CTA, psychologie, clarté, rythme).");
  lines.push("Tu écris en français, en texte brut uniquement.");
  lines.push("Phrases courtes. Pas de blabla. Pas de markdown. Pas de gras. Pas de titres.");
  lines.push("Mise en page: retour à la ligne après chaque phrase (emails faciles à lire).");
  lines.push("Tu t'appuies sur le persona + l'offre + les ressources internes (triggers, structures) fournis dans le contexte.");
  lines.push("Tu restes humain: naturel, direct, crédible.");
  lines.push("");
  lines.push(`Tutoiement/Vouvoiement: ${formality}.`);
  lines.push("");

  if (type === "newsletter") {
    lines.push("Type: Newsletter.");
    lines.push("Objectif: apporter de la valeur, créer de la confiance, et générer des clics/réponses.");
    lines.push("1 email.");
    lines.push("Contenu: une idée forte + un exemple concret + un conseil actionnable + CTA.");
    lines.push("CTA: 1 seule action.");
    lines.push("");

    if (theme) lines.push(`Thème: ${theme}`);
    if (cta) lines.push(`CTA demandé: ${cta}`);

    lines.push("");
    lines.push("Règles importantes:");
    lines.push("- Fais simple, concret, orienté action.");
    lines.push("- Pas de promesses vagues.");
    lines.push("- Pas de listes trop longues.");
    lines.push("");

    lines.push("Format de sortie attendu:");
    lines.push("Ligne 1: Objet: ...");
    lines.push("Ligne 2: Préheader: ...");
    lines.push("Puis le corps avec retours à la ligne.");
    lines.push("Termine par 1 CTA clair.");
    lines.push("Ne mets aucune signature si elle n'est pas demandée.");

    return lines.join("\n");
  }

  if (type === "sales_single" || type === "sales_sequence_7") {
    const count = type === "sales_single" ? 1 : 7;

    lines.push(type === "sales_single" ? "Type: Email de vente (1 email)." : "Type: Séquence de vente (7 emails).");
    lines.push("Objectif: faire passer à l'action avec une offre précise.");
    lines.push("Chaque email doit contenir: Objet + Préheader + Corps + CTA (1 CTA clair).");
    lines.push("Évite les mots spam évidents, garde un ton humain.");
    lines.push("Varie les angles sans les citer (douleur, désir, preuve, objection, urgence, storytelling, démonstration).");
    lines.push("Surtout: utilise les détails de l'offre (promesse, public, prix, format, livraison, résultat) pour être spécifique.");
    lines.push("");

    if (subject) lines.push(`Intention / angle: ${subject}`);

    if (offerLink) {
      lines.push("");
      lines.push("Lien de la page/offre (si fourni):");
      lines.push(offerLink);
    }

    const offerSummary = offerSummaryBlock({
      label: "Offre à vendre",
      offer: params.offer ?? null,
      manual: params.offerManual ?? null,
    });

    if (offerSummary.length) {
      lines.push("");
      lines.push(...offerSummary);
    }

    if (cta) {
      lines.push("");
      lines.push(`CTA demandé (action/lien): ${cta}`);
    }

    lines.push("");
    lines.push("Consignes de conversion:");
    lines.push("- Commence fort: 1 hook (curiosité OU douleur OU promesse).");
    lines.push("- Fais sentir le coût de l'inaction.");
    lines.push("- Ajoute preuve: mini-preuve, exemple, mécanisme, logique, ou objection traitée.");
    lines.push("- Termine par un CTA simple (une seule action).");
    lines.push("- Si prix non fourni: n'invente pas de prix. Parle de la valeur et renvoie au lien.");
    lines.push("");

    lines.push("Format de sortie attendu:");
    if (count > 1) {
      lines.push(`Rends ${count} emails numérotés.`);
      lines.push("Sépare les emails par une ligne contenant uniquement: -----");
    } else {
      lines.push("Rends 1 email.");
    }
    lines.push("Pour chaque email:");
    lines.push("Ligne 1: Objet: ...");
    lines.push("Ligne 2: Préheader: ...");
    lines.push("Puis le corps avec retours à la ligne.");
    lines.push("Termine par 1 CTA clair (une seule action).");
    lines.push("Ne mets aucune signature si elle n'est pas demandée.");

    return lines.join("\n");
  }

  // Onboarding KLT x3 + lead magnet
  const lm = resolveLeadMagnet(params);
  const leadMagnetSummary = offerSummaryBlock({
    label: "Lead magnet (offre gratuite à délivrer dans l'onboarding)",
    offer: lm.offer ?? null,
    manual: lm.manual ?? null,
  });

  lines.push("Type: Onboarding (3 emails) — Know / Like / Trust + délivrance du lead magnet.");
  lines.push("Objectif: accueillir, créer un lien, donner confiance, et faire consommer le lead magnet.");
  lines.push("Rends 3 emails.");
  lines.push("Email 1: Bienvenue + délivrance lead magnet + cadrage + bénéfices + attentes + micro-CTA (répondre/whitelist).");
  lines.push("Email 2: Know/Like: qui tu es + pourquoi te faire confiance + 1 enseignement simple + teaser du prochain email.");
  lines.push("Email 3: Trust: histoire (avant/après) + preuve + leçon + CTA vers le lead magnet (ou l'action demandée).");
  lines.push("Chaque email: Objet + Préheader + Corps + CTA (1 CTA clair).");
  lines.push("Mise en page: retours à la ligne, style conversationnel, phrases courtes.");
  lines.push("");
  lines.push("Règle: n'invente pas de lien. Utilise le lien fourni. Si aucun lien: utilise le CTA alternatif (répondre, etc.).");
  lines.push("");

  if (subject) lines.push(`Intention / sujet: ${subject}`);

  if (leadMagnetSummary.length) {
    lines.push("");
    lines.push(...leadMagnetSummary);
  }

  if (leadMagnetLink) {
    lines.push("");
    lines.push("Lien lead magnet à télécharger:");
    lines.push(leadMagnetLink);
  }

  if (onboardingCta) {
    lines.push("");
    lines.push(`CTA demandé (action/lien): ${onboardingCta}`);
  }

  lines.push("");
  lines.push("Style à respecter (inspiration):");
  lines.push("- Ton chaleureux, simple, direct.");
  lines.push("- Beaucoup de retours à la ligne.");
  lines.push("- Promesse claire de ce que la personne va recevoir dans les prochains emails.");
  lines.push("- Story personnelle crédible (avant/après).");
  lines.push("- Teasing (\"Réponse demain...\").");
  lines.push("- PS/PPS possibles si utile.");
  lines.push("- Mentionne le public du lead magnet si fourni, pour que la personne se sente concernée.");
  lines.push("");

  lines.push("Format de sortie attendu:");
  lines.push("Rends 3 emails numérotés.");
  lines.push("Sépare les emails par une ligne contenant uniquement: -----");
  lines.push("Pour chaque email:");
  lines.push("Ligne 1: Objet: ...");
  lines.push("Ligne 2: Préheader: ...");
  lines.push("Puis le corps avec retours à la ligne.");
  lines.push("Termine par 1 CTA clair.");
  lines.push("Ne mets aucune signature si elle n'est pas demandée.");

  return lines.join("\n");
}
