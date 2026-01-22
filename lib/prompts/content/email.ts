// lib/prompts/content/email.ts
// Builder prompt Email (plain text) — copywriter expert
// Objectif: produire des emails très convertissants en FR, en s'appuyant sur persona/plan/knowledge injectés côté API.

export type EmailTypeId = "nurturing" | "sales_sequence" | "onboarding";

export type EmailPromptParams = {
  emailType: EmailTypeId;
  formality?: "tu" | "vous";
  subject: string;

  // Pour sales_sequence (recommandé)
  offer?: {
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
  } | null;

  // Optionnel (si plus tard on ajoute le support page de vente)
  offerLink?: string | null;
};

function clean(s: unknown, max = 1200) {
  const x = typeof s === "string" ? s.trim() : "";
  if (!x) return "";
  return x.length > max ? x.slice(0, max) : x;
}

export function buildEmailPrompt(params: EmailPromptParams): string {
  const emailType = params.emailType;
  const formality = params.formality === "tu" ? "tu" : "vous";
  const subject = clean(params.subject, 240);
  const offer = params.offer ?? null;
  const offerLink = clean(params.offerLink, 400) || "";

  const lines: string[] = [];

  lines.push("Tu es un copywriter senior spécialisé en email marketing pour entrepreneurs francophones.");
  lines.push("Tu maîtrises les meilleures pratiques 2025 (deliverability, angles, hooks, CTA, psychologie).");
  lines.push("Tu écris en français, en texte brut uniquement.");
  lines.push("Phrases courtes. Pas de blabla. Pas de markdown. Pas de gras. Pas de titres.");
  lines.push("Mise en page: retour à la ligne après chaque phrase (emails faciles à lire).");
  lines.push("Tu t'appuies sur le persona + l'offre + les ressources internes (triggers, structures) fournis dans le contexte.");
  lines.push("");

  if (emailType === "sales_sequence") {
    lines.push("Objectif: créer une SÉQUENCE de vente qui convertit.");
    lines.push("Nombre: 5 emails.");
    lines.push("Chaque email doit contenir: Objet + Préheader + Corps + CTA (1 CTA clair).");
    lines.push("Varie les angles d'un email à l'autre: douleur, désir, preuve, objection, urgence, storytelling, démonstration.");
    lines.push("Utilise des déclencheurs psychologiques de manière subtile (sans les citer).");
    lines.push("Évite les mots spam évidents, garde un ton humain.");
  } else if (emailType === "nurturing") {
    lines.push("Objectif: nurturing (valeur + confiance + micro-CTA).");
    lines.push("1 email.");
    lines.push("Contenu: une idée forte + une mini histoire ou exemple + 1 conseil actionnable + CTA soft.");
  } else {
    lines.push("Objectif: onboarding (activer l'utilisateur rapidement).");
    lines.push("1 email.");
    lines.push("Contenu: bienvenue + bénéfice principal + 3 étapes simples + CTA clair.");
  }

  lines.push("");
  lines.push(`Tutoiement/Vouvoiement: ${formality}.`);
  lines.push(`Intention (sujet): ${subject}.`);

  if (offerLink) {
    lines.push("");
    lines.push("Lien de l'offre/page (si fourni):");
    lines.push(offerLink);
  }

  if (offer) {
    const offerName = clean(offer.name, 220);
    const offerLevel = clean(offer.level, 80);
    const promise = clean(offer.promise, 500);
    const description = clean(offer.description, 1400);
    const mainOutcome = clean(offer.main_outcome, 500);
    const format = clean(offer.format, 240);
    const delivery = clean(offer.delivery, 240);
    const priceMin = typeof offer.price_min === "number" ? offer.price_min : null;
    const priceMax = typeof offer.price_max === "number" ? offer.price_max : null;
    const price =
      priceMin !== null && priceMax !== null
        ? priceMin === priceMax
          ? `${priceMin}€`
          : `${priceMin}–${priceMax}€`
        : priceMin !== null
          ? `${priceMin}€`
          : priceMax !== null
            ? `${priceMax}€`
            : "";

    lines.push("");
    lines.push("Offre à vendre (importée automatiquement) :");
    if (offerName) lines.push(`Nom: ${offerName}`);
    if (offerLevel) lines.push(`Niveau: ${offerLevel}`);
    if (price) lines.push(`Prix: ${price}`);
    if (promise) lines.push(`Promesse: ${promise}`);
    if (mainOutcome) lines.push(`Résultat principal: ${mainOutcome}`);
    if (format) lines.push(`Format: ${format}`);
    if (delivery) lines.push(`Livraison: ${delivery}`);
    if (description) lines.push(`Description: ${description}`);
  }

  lines.push("");
  lines.push("Format de sortie attendu:");
  if (emailType === "sales_sequence") {
    lines.push("Rends 5 emails numérotés.");
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
