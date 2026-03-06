// lib/prompts/content/funnel.ts
// Funnel prompts: capture / sales pages
// - Legacy output: plain text
// - Premium output: JSON contentData that must fit a template schema (slot lock)
//
// NOTE: The global context (persona, business profile, plan, Tipote Knowledge snippets)
// is injected in /app/api/content/generate/route.ts

export type FunnelPage = "capture" | "sales";
export type FunnelMode = "from_offer" | "from_existing" | "from_scratch";

export type FunnelPricingTier = {
  label: string;
  price: string;
  period?: string;
  description?: string;
};

export type FunnelOfferContext = {
  id: string;
  name: string | null;
  level: string | null;
  description: string | null;
  promise: string | null;
  price_min: any;
  price_max: any;
  main_outcome: string | null;
  format: string | null;
  delivery: string | null;
  is_flagship?: boolean | null;
  updated_at?: string | null;
  pricing?: FunnelPricingTier[] | null;
};

export type FunnelManual = {
  name?: string | null;
  promise?: string | null;
  target?: string | null;
  price?: string | null;
  urgency?: string | null;
  guarantee?: string | null;
};

export type FunnelBrandingContext = {
  font?: string | null;
  colorBase?: string | null;
  colorAccent?: string | null;
  toneOfVoice?: string | null;
};

export type FunnelPromptParams = {
  page: FunnelPage;
  mode: FunnelMode;
  theme: string;

  offer: FunnelOfferContext | null;
  manual: FunnelManual | null;

  // Premium template mode
  outputFormat?: "text" | "contentData_json";
  templateKind?: "capture" | "vente";
  templateId?: string;
  templateSchemaPrompt?: string;

  // Branding context
  branding?: FunnelBrandingContext | null;

  language?: string;
  formality?: "tu" | "vous";
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function oneLine(s: string): string {
  return safeString(s).replace(/\s+/g, " ").trim();
}

function buildPremiumJsonPrompt(params: FunnelPromptParams): string {
  const lines: string[] = [];

  lines.push("OBJECTIF :");
  lines.push("- Tu es un copywriter direct-response senior.");
  lines.push("- Tu dois remplir un template de page (capture/vente) SANS AUCUNE dérive visuelle.");
  lines.push("- Tu dois produire UNIQUEMENT un objet JSON (pas de texte autour).");
  lines.push("- Le JSON doit correspondre strictement au schéma fourni (clés, types, nombres d'items, longueurs).");
  lines.push("- Le texte DOIT être adapté à l'offre et au thème, et être lisible, concret, très premium.");
  lines.push(
    '- Utilise activement les extraits "Tipote Knowledge" fournis dans le contexte (si présents) pour améliorer les titres, promesses, preuves et bénéfices.',
  );
  lines.push("");

  // ---- CADRE DE PERSUASION Blair Warren ----
  lines.push("CADRE DE PERSUASION (Blair Warren — fil conducteur du copywriting) :");
  lines.push("Le contenu doit naturellement intégrer ces 5 leviers psychologiques :");
  lines.push("1. ENCOURAGER LES RÊVES : Montre au prospect que son rêve est atteignable. Peins le tableau de sa transformation.");
  lines.push("2. JUSTIFIER LES ÉCHECS : Explique pourquoi ses tentatives passées n'ont pas fonctionné (pas la bonne méthode/le bon outil).");
  lines.push("3. APAISER LES PEURS : Anticipe ses doutes et rassure concrètement (garanties, simplicité, accompagnement).");
  lines.push("4. CONFIRMER LES SOUPÇONS : Valide ce qu'il soupçonne déjà (\"Ce que personne ne te dit...\").");
  lines.push("5. TROUVER UN ENNEMI COMMUN : Identifie un obstacle externe (le système, les méthodes traditionnelles) pour se placer du côté du prospect.");
  lines.push("");

  // ---- 5 CRITÈRES D'UN CONTENU DE VALEUR ----
  lines.push("5 CRITÈRES DE CONTENU (chaque texte doit cocher les 5) :");
  lines.push("- UTILE : Bénéfice concret et immédiat pour le lecteur.");
  lines.push("- SPÉCIFIQUE : Une stratégie, un outil, une méthode précise — jamais de vague.");
  lines.push("- CIBLÉ : S'adresse à UNE seule audience avec SES mots, SES problèmes, SES rêves.");
  lines.push("- APPLICABLE : Le lecteur repart avec une action concrète.");
  lines.push("- UNIQUE : Reflète la personnalité de l'auteur — pas un contenu interchangeable.");
  lines.push("");

  lines.push("RÈGLES CRITIQUES :");
  lines.push("- ZÉRO markdown (pas de **, ##, >, -, etc.).");
  lines.push("- ZÉRO balise HTML (<br>, <span>, <strong>, <p>, <div>, etc.) — texte brut uniquement.");
  lines.push("- ZÉRO emoji.");
  lines.push("- Pas de retours à la ligne dans les strings (une ligne par champ).");
  lines.push("- Ne mets pas de guillemets typographiques. Utilise \" si nécessaire.");
  lines.push("- Si une info est inconnue, reste générique et plausible, sans inventer un prix ou une garantie.");
  lines.push("- INTERDIT d'inventer des bonus, des noms de personnes, des témoignages ou des garanties non fournis.");
  lines.push("- INTERDIT de recopier les descriptions d'aide du schéma comme contenu (\"Décris ici\", \"Puce promesse\", \"bénéfice + conséquence\", etc.).");
  lines.push("- Chaque champ doit contenir du VRAI texte de copywriting professionnel, prêt à publier.");
  lines.push("- Pour les FAQ : chaque item doit avoir une question ET une réponse complète (2-3 phrases).");
  lines.push("- Chaque titre/promo doit être clair, spécifique et orienté résultat.");
  lines.push("");

  lines.push("CONTRAINTE DE SORTIE :");
  lines.push("- Sortie = 1 seul objet JSON valide.");
  lines.push("");

  if (params.page === "capture") {
    lines.push("TYPE DE PAGE : CAPTURE");
    lines.push("- Objectif: convertir en inscription/email.");
    lines.push("- Promesse claire + bénéfices + preuve + CTA simple.");
  } else {
    lines.push("TYPE DE PAGE : VENTE");
    lines.push("- Objectif: convertir en achat.");
    lines.push("- Promesse + mécanisme + preuve + objections + offre + urgence/garantie + CTA.");
  }
  lines.push("");

  if ((params.mode === "from_offer" || params.mode === "from_existing") && params.offer) {
    lines.push("OFFRE (source) :");
    lines.push(oneLine(JSON.stringify(params.offer)));
    lines.push("");
  }

  if (params.mode === "from_scratch" && params.manual) {
    lines.push("OFFRE (manual) :");
    lines.push(oneLine(JSON.stringify(params.manual)));
    lines.push("");
  }

  // Branding context (if available)
  if (params.branding) {
    const b = params.branding;
    const brandLines: string[] = [];
    if (b.toneOfVoice) brandLines.push(`Ton de voix de la marque : ${b.toneOfVoice}`);
    if (b.font) brandLines.push(`Police de la marque : ${b.font}`);
    if (b.colorBase) brandLines.push(`Couleur de base : ${b.colorBase}`);
    if (b.colorAccent) brandLines.push(`Couleur d'accentuation : ${b.colorAccent}`);
    if (brandLines.length > 0) {
      lines.push("BRANDING DE L'UTILISATEUR :");
      lines.push("- Adapte le ton du copywriting au ton de voix de la marque si spécifié.");
      lines.push("- Les couleurs et la police sont appliquées séparément (pas dans le JSON).");
      brandLines.forEach((l) => lines.push(`- ${l}`));
      lines.push("");
    }
  }

  lines.push("SCHÉMA TEMPLATE À RESPECTER :");
  lines.push(params.templateSchemaPrompt || "");
  lines.push("");

  if (params.language && params.language !== "fr") {
    lines.push(`LANGUE OBLIGATOIRE: ${params.language}. Tout le texte du JSON doit être rédigé dans cette langue.`);
    lines.push("");
  }

  const formalityPremium = params.formality === "vous" ? "vous" : "tu";
  lines.push(`TUTOIEMENT/VOUVOIEMENT : Utilise "${formalityPremium}" pour t'adresser au lecteur dans tout le contenu.`);
  lines.push("");

  lines.push("IMPORTANT :");
  lines.push("- Respecte maxLength / minItems / maxItems / itemMaxLength.");
  lines.push("- Remplis tous les champs requis.");
  lines.push("- Si un champ est optionnel mais utile, remplis-le quand même.");
  lines.push("- Ne commente pas. Ne t'excuse pas. JSON uniquement.");

  return lines.join("\n");
}

function buildLegacyTextPrompt(params: FunnelPromptParams): string {
  const lines: string[] = [];

  const pageName = params.page === "capture" ? "Page de capture" : "Page de vente";

  const formalityLegacy = params.formality === "vous" ? "vous" : "tu";

  lines.push(`${pageName} — Copywriting premium.`);
  lines.push("IMPORTANT: Retourne uniquement le contenu final, sans explication, sans markdown.");
  if (params.language && params.language !== "fr") {
    lines.push(`LANGUE OBLIGATOIRE: ${params.language}. Tout le contenu doit être rédigé dans cette langue.`);
  }
  lines.push(`Tutoiement/Vouvoiement: utilise "${formalityLegacy}" pour t'adresser au lecteur.`);
  lines.push("");

  if ((params.mode === "from_offer" || params.mode === "from_existing") && params.offer) {
    lines.push("Offre (source):");
    lines.push(JSON.stringify(params.offer, null, 0));
    lines.push("");
  }

  if (params.mode === "from_scratch" && params.manual) {
    lines.push("Offre (manual):");
    lines.push(JSON.stringify(params.manual, null, 0));
    lines.push("");
  }

  lines.push("Contraintes:");
  lines.push("- Texte concret, orienté résultat.");
  lines.push("- Promesse claire, bénéfices, preuves, CTA.");
  if (params.page === "sales") {
    lines.push("- Traite objections + garantie + urgence si pertinent.");
  }
  lines.push("");
  lines.push("Thème / brief:");
  lines.push(params.theme || "Funnel");

  return lines.join("\n");
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  const outputFormat = params.outputFormat || "text";

  if (outputFormat === "contentData_json" && params.templateSchemaPrompt) {
    return buildPremiumJsonPrompt(params);
  }

  return buildLegacyTextPrompt(params);
}