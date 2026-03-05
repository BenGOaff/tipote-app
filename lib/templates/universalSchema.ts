// lib/templates/universalSchema.ts
// Universal content schema for ALL templates (capture + sales).
//
// PHILOSOPHY:
// Templates are DESIGN-ONLY: layout, colors, animations, gradients, button styles.
// Content is 100% AI-generated based on:
//   - User's offer, persona, tonality, branding
//   - Copywriting knowledge (swipefiles, puces promesses, accroches)
//   - The universal schema below (NOT the template's content-schema.json)
//
// The universal schema defines copywriting SECTIONS that exist in every good
// sales/capture page. The renderer then MAPS these sections to each template's
// specific selectors/placeholders.

export type UniversalFieldKind = "scalar" | "array_scalar" | "array_object";

export type UniversalField = {
  key: string;
  kind: UniversalFieldKind;
  label: string;
  description: string;
  required: boolean;
  pageTypes: ("capture" | "sales")[]; // which page types use this field
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  itemMaxLength?: number;
  subFields?: Array<{ key: string; label: string; maxLength?: number }>;
};

// ---------- UNIVERSAL CAPTURE SCHEMA ----------

const CAPTURE_FIELDS: UniversalField[] = [
  // --- Brand / Logo ---
  {
    key: "logo_text",
    kind: "scalar",
    label: "Texte du logo",
    description: "Nom de la marque ou de l'offre (source: user branding)",
    required: true,
    pageTypes: ["capture"],
    maxLength: 25,
  },
  // --- Hero ---
  {
    key: "hero_eyebrow",
    kind: "scalar",
    label: "Sur-titre hero",
    description: "Phrase courte de contexte au-dessus du titre (catégorie, type d'offre, label)",
    required: false,
    pageTypes: ["capture"],
    maxLength: 50,
  },
  {
    key: "hero_title",
    kind: "scalar",
    label: "Titre principal",
    description: "Promesse de valeur irrésistible, spécifique, orientée résultat. Doit créer de la curiosité ou de l'urgence.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 120,
  },
  {
    key: "hero_subtitle",
    kind: "scalar",
    label: "Sous-titre hero",
    description: "Complète la promesse : qui est concerné, quel résultat, sans quoi (éliminer les objections).",
    required: true,
    pageTypes: ["capture"],
    maxLength: 150,
  },
  // --- Benefits ---
  {
    key: "benefits_title",
    kind: "scalar",
    label: "Titre section bénéfices",
    description: "Introduit les bénéfices clés du lead magnet ou de l'offre gratuite.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  {
    key: "benefits",
    kind: "array_scalar",
    label: "Bénéfices / Puces promesses",
    description: "Chaque puce = 1 bénéfice concret + conséquence positive. Phrase complète, spécifique, orientée résultat.",
    required: true,
    pageTypes: ["capture"],
    minItems: 3,
    maxItems: 6,
    itemMaxLength: 120,
  },
  // --- Social proof ---
  {
    key: "social_proof_text",
    kind: "scalar",
    label: "Preuve sociale",
    description: "Chiffre ou fait de crédibilité (ex: '2 500+ entrepreneurs accompagnés').",
    required: false,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  // --- About / Authority ---
  {
    key: "about_name",
    kind: "scalar",
    label: "Nom de l'auteur",
    description: "Nom complet de l'auteur/expert (source: user profile).",
    required: false,
    pageTypes: ["capture"],
    maxLength: 50,
  },
  {
    key: "about_description",
    kind: "scalar",
    label: "Mini bio",
    description: "1-2 phrases sur l'expertise et la mission de l'auteur.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 200,
  },
  // --- CTA ---
  {
    key: "cta_text",
    kind: "scalar",
    label: "Texte CTA principal",
    description: "Verbe d'action orienté résultat, 2-5 mots. Ex: 'Je télécharge mon guide'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 40,
  },
  {
    key: "cta_subtitle",
    kind: "scalar",
    label: "Sous-texte CTA",
    description: "Réassurance sous le bouton. Ex: 'Accès gratuit et immédiat'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 50,
  },
  // --- Footer ---
  {
    key: "footer_text",
    kind: "scalar",
    label: "Texte footer",
    description: "Copyright ou mention légale courte.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 100,
  },
];

// ---------- UNIVERSAL SALES SCHEMA ----------

const SALES_FIELDS: UniversalField[] = [
  // --- Brand / Logo ---
  {
    key: "logo_text",
    kind: "scalar",
    label: "Texte du logo",
    description: "Nom de la marque ou de l'offre.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 25,
  },
  {
    key: "nav_links",
    kind: "array_scalar",
    label: "Navigation",
    description: "Ancres de navigation (noms de sections). Ex: 'Programme', 'Garantie', 'Tarifs'.",
    required: false,
    pageTypes: ["sales"],
    minItems: 3,
    maxItems: 5,
    itemMaxLength: 20,
  },
  // --- Alert / Banner ---
  {
    key: "alert_banner_text",
    kind: "scalar",
    label: "Bannière d'alerte",
    description: "Message d'urgence ou annonce importante en haut de page. Laisser vide si pas d'urgence.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 80,
  },
  // --- Hero ---
  {
    key: "hero_eyebrow",
    kind: "scalar",
    label: "Sur-titre hero",
    description: "Badge ou label au-dessus du titre (type d'offre, exclusivité, label d'urgence).",
    required: false,
    pageTypes: ["sales"],
    maxLength: 50,
  },
  {
    key: "hero_title",
    kind: "scalar",
    label: "Titre hero",
    description: "Promesse principale ultra-spécifique. Doit capturer l'attention en 3 secondes.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 120,
  },
  {
    key: "hero_subtitle",
    kind: "scalar",
    label: "Sous-titre hero",
    description: "Complète la promesse : pour qui, quel résultat concret, sans quelle difficulté.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 150,
  },
  {
    key: "hero_description",
    kind: "scalar",
    label: "Description hero",
    description: "Paragraphe d'amplification qui développe la promesse (optionnel).",
    required: false,
    pageTypes: ["sales"],
    maxLength: 300,
  },
  // --- Problem / Agitation ---
  {
    key: "problem_title",
    kind: "scalar",
    label: "Titre section problème",
    description: "Introduit la douleur / le problème du prospect.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 100,
  },
  {
    key: "problem_description",
    kind: "scalar",
    label: "Description du problème",
    description: "Paragraphe qui décrit la situation douloureuse du prospect avec empathie.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 400,
  },
  {
    key: "problem_bullets",
    kind: "array_scalar",
    label: "Points de douleur",
    description: "Situations frustrantes que vit le prospect. Phrases concrètes et identifiables.",
    required: false,
    pageTypes: ["sales"],
    minItems: 3,
    maxItems: 6,
    itemMaxLength: 100,
  },
  // --- Solution ---
  {
    key: "solution_title",
    kind: "scalar",
    label: "Titre section solution",
    description: "Annonce la solution / l'offre comme la réponse au problème.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 100,
  },
  {
    key: "solution_description",
    kind: "scalar",
    label: "Description de la solution",
    description: "Explique COMMENT l'offre résout le problème. Mécanisme clair.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 400,
  },
  // --- Benefits / Promise bullets ---
  {
    key: "benefits_title",
    kind: "scalar",
    label: "Titre section bénéfices",
    description: "Introduit les résultats concrets que le prospect va obtenir.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 80,
  },
  {
    key: "benefits",
    kind: "array_scalar",
    label: "Puces promesses",
    description: "Chaque puce = 1 bénéfice concret + conséquence positive. Phrase complète, pas de jargon.",
    required: true,
    pageTypes: ["sales"],
    minItems: 4,
    maxItems: 8,
    itemMaxLength: 120,
  },
  // --- Program / Content / Modules ---
  {
    key: "program_title",
    kind: "scalar",
    label: "Titre du programme/contenu",
    description: "Introduit le contenu de l'offre (modules, étapes, chapitres, fonctionnalités selon le type).",
    required: false,
    pageTypes: ["sales"],
    maxLength: 80,
  },
  {
    key: "program_items",
    kind: "array_object",
    label: "Modules / Étapes / Chapitres",
    description: "Détail du contenu de l'offre. Adapte le vocabulaire au type : modules (formation), étapes (méthode), chapitres (ebook), fonctionnalités (SaaS).",
    required: true,
    pageTypes: ["sales"],
    minItems: 3,
    maxItems: 7,
    subFields: [
      { key: "label", label: "Étiquette (MODULE 1, ÉTAPE 1, etc.)", maxLength: 20 },
      { key: "title", label: "Titre du module/étape", maxLength: 80 },
      { key: "description", label: "Description en 1-2 phrases", maxLength: 200 },
    ],
  },
  // --- About / Authority ---
  {
    key: "about_title",
    kind: "scalar",
    label: "Titre section À propos",
    description: "Introduit l'auteur/expert (ex: 'Qui suis-je ?', 'Ton formateur').",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  {
    key: "about_name",
    kind: "scalar",
    label: "Nom de l'auteur",
    description: "Nom complet (source: user profile).",
    required: false,
    pageTypes: ["sales"],
    maxLength: 50,
  },
  {
    key: "about_description",
    kind: "scalar",
    label: "Bio de l'auteur",
    description: "Parcours, expertise, résultats obtenus. Crédibilité et connexion humaine.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 400,
  },
  // --- Testimonials ---
  {
    key: "testimonials_title",
    kind: "scalar",
    label: "Titre section témoignages",
    description: "Introduit les témoignages. Laisser vide si aucun témoignage fourni.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  {
    key: "testimonials",
    kind: "array_object",
    label: "Témoignages",
    description: "Témoignages réels fournis par l'utilisateur. NE JAMAIS INVENTER de témoignages.",
    required: false,
    pageTypes: ["sales"],
    minItems: 0,
    maxItems: 6,
    subFields: [
      { key: "content", label: "Texte du témoignage", maxLength: 300 },
      { key: "author_name", label: "Nom de l'auteur", maxLength: 50 },
      { key: "author_role", label: "Rôle/titre", maxLength: 50 },
    ],
  },
  // --- Bonuses ---
  {
    key: "bonuses_title",
    kind: "scalar",
    label: "Titre section bonus",
    description: "Introduit les bonus. Laisser vide si aucun bonus fourni.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  {
    key: "bonuses",
    kind: "array_object",
    label: "Bonus",
    description: "Bonus fournis par l'utilisateur. NE JAMAIS INVENTER de bonus.",
    required: false,
    pageTypes: ["sales"],
    minItems: 0,
    maxItems: 9,
    subFields: [
      { key: "title", label: "Nom du bonus", maxLength: 80 },
      { key: "description", label: "Description du bonus", maxLength: 200 },
    ],
  },
  // --- Guarantee ---
  {
    key: "guarantee_title",
    kind: "scalar",
    label: "Titre garantie",
    description: "Titre de la section garantie. Laisser vide si aucune garantie fournie.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  {
    key: "guarantee_text",
    kind: "scalar",
    label: "Texte de la garantie",
    description: "Détail de la garantie (satisfait ou remboursé, période, conditions).",
    required: false,
    pageTypes: ["sales"],
    maxLength: 300,
  },
  // --- Pricing ---
  {
    key: "price_title",
    kind: "scalar",
    label: "Titre section prix",
    description: "Introduit le prix / l'offre. Ex: 'Investis dans ta transformation'.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 80,
  },
  {
    key: "price_amount",
    kind: "scalar",
    label: "Prix principal",
    description: "Prix formaté selon la locale (ex: '497 €', '$297'). Source: user input.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 20,
  },
  {
    key: "price_old",
    kind: "scalar",
    label: "Ancien prix barré",
    description: "Prix barré pour montrer la réduction. Laisser vide si pas de réduction.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 20,
  },
  {
    key: "price_note",
    kind: "scalar",
    label: "Note sous le prix",
    description: "Paiement en plusieurs fois, accès à vie, etc.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 80,
  },
  // --- Urgency ---
  {
    key: "urgency_text",
    kind: "scalar",
    label: "Texte d'urgence",
    description: "Raison d'agir maintenant. Laisser vide si aucune urgence fournie par l'utilisateur.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 100,
  },
  // --- Objections / FAQ ---
  {
    key: "faq_title",
    kind: "scalar",
    label: "Titre FAQ",
    description: "Titre de la section questions fréquentes.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  {
    key: "faqs",
    kind: "array_object",
    label: "Questions fréquentes",
    description: "Chaque FAQ traite une objection courante. Question ET réponse complète obligatoires.",
    required: true,
    pageTypes: ["sales"],
    minItems: 4,
    maxItems: 8,
    subFields: [
      { key: "question", label: "Question", maxLength: 100 },
      { key: "answer", label: "Réponse (2-3 phrases)", maxLength: 300 },
    ],
  },
  // --- CTA ---
  {
    key: "cta_text",
    kind: "scalar",
    label: "Texte CTA principal",
    description: "Verbe d'action orienté résultat, 2-5 mots. Ex: 'Je rejoins maintenant'.",
    required: true,
    pageTypes: ["sales"],
    maxLength: 40,
  },
  {
    key: "cta_subtitle",
    kind: "scalar",
    label: "Sous-texte CTA",
    description: "Réassurance : 'Satisfait ou remboursé', 'Accès immédiat', etc.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 60,
  },
  // --- Final push ---
  {
    key: "final_title",
    kind: "scalar",
    label: "Titre CTA final",
    description: "Dernière accroche avant le bouton final. Résume pourquoi agir maintenant.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 100,
  },
  {
    key: "final_description",
    kind: "scalar",
    label: "Paragraphe CTA final",
    description: "Dernier paragraphe émotionnel qui pousse à l'action.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 300,
  },
  // --- Footer ---
  {
    key: "footer_text",
    kind: "scalar",
    label: "Texte footer",
    description: "Copyright ou mention de marque.",
    required: false,
    pageTypes: ["sales"],
    maxLength: 100,
  },
];

// ---------- Public API ----------

export function getUniversalSchema(pageType: "capture" | "sales"): UniversalField[] {
  if (pageType === "capture") return CAPTURE_FIELDS;
  return SALES_FIELDS;
}

/**
 * Convert the universal schema into a prompt for the AI.
 * This replaces the per-template schemaToPrompt() function.
 */
export function universalSchemaToPrompt(pageType: "capture" | "sales"): string {
  const fields = getUniversalSchema(pageType);
  const lines: string[] = [];

  lines.push("SCHÉMA UNIVERSEL DE CONTENU :");
  lines.push("Tu dois produire un JSON avec les clés suivantes.");
  lines.push("Ce JSON est INDÉPENDANT du template visuel — il contient uniquement du copywriting.");
  lines.push("Le template est choisi séparément pour son DESIGN (couleurs, layout, animations).");
  lines.push("");
  lines.push("CHAMPS À REMPLIR (JSON) :");
  lines.push("");

  for (const f of fields) {
    if (f.kind === "scalar") {
      let line = `- "${f.key}": string`;
      if (f.maxLength) line += ` (max ${f.maxLength} car.)`;
      line += ` — ${f.label}`;
      if (f.required) line += " [REQUIS]";
      lines.push(line);
      lines.push(`  → ${f.description}`);
    } else if (f.kind === "array_scalar") {
      let line = `- "${f.key}": string[]`;
      if (f.minItems != null && f.maxItems != null) line += ` (${f.minItems}-${f.maxItems} items)`;
      if (f.itemMaxLength) line += ` (item max ${f.itemMaxLength} car.)`;
      line += ` — ${f.label}`;
      if (f.required) line += " [REQUIS]";
      lines.push(line);
      lines.push(`  → ${f.description}`);
    } else if (f.kind === "array_object") {
      const subDesc = (f.subFields || [])
        .map((s) => `${s.key}: string${s.maxLength ? ` (max ${s.maxLength})` : ""}`)
        .join(", ");
      let line = `- "${f.key}": [{ ${subDesc} }]`;
      if (f.minItems != null && f.maxItems != null) line += ` (${f.minItems}-${f.maxItems} items)`;
      line += ` — ${f.label}`;
      if (f.required) line += " [REQUIS]";
      lines.push(line);
      lines.push(`  → ${f.description}`);
    }
  }

  lines.push("");
  lines.push("RÈGLES DE SORTIE (STRICT) :");
  lines.push('- Retourne UNIQUEMENT un objet JSON valide (double quotes, pas de commentaire, pas de texte autour).');
  lines.push("- Respecte STRICTEMENT les clés ci-dessus (aucune clé en plus, aucune clé manquante).");
  lines.push('- Aucune valeur null/undefined : si tu n\'as pas l\'info, mets une string vide "" ou un tableau vide [].');
  lines.push("- ZÉRO balise HTML — texte brut uniquement.");
  lines.push("- ZÉRO markdown (**, ##, -, >, etc.).");
  lines.push("- ZÉRO emoji.");
  lines.push("- Les strings : 1-2 phrases max, pas de sauts de ligne.");
  lines.push("- Les listes : items courts, concrets (6-14 mots).");
  lines.push("- CTA : verbe d'action clair, 2-5 mots, orienté résultat.");
  lines.push("- Style : premium, direct, très lisible. Zéro blabla.");
  lines.push("- FAQ : chaque item DOIT avoir question ET réponse complète (2-3 phrases).");

  return lines.join("\n");
}

// ---------- Template content mapping ----------

/**
 * Map universal contentData to a template's specific field names.
 * Uses the template's selectors.json to know which fields the template expects.
 *
 * Strategy:
 * 1. Start with the universal contentData as-is
 * 2. Add template-specific aliases (e.g., hero_title → challenge_name for sale-08)
 * 3. Map universal arrays to template-specific array structures
 */
export function mapUniversalToTemplate(
  universalData: Record<string, any>,
  templateSelectors: Record<string, any>,
): Record<string, any> {
  const mapped: Record<string, any> = { ...universalData };

  // Get all string selectors the template expects
  const stringSelectors = templateSelectors?.string || {};
  const arraySelectors = templateSelectors?.arrays || {};

  // --- STRING FIELD MAPPING ---
  // For each template field, find the best universal match

  const STRING_MAP: Record<string, string[]> = {
    // Hero variants
    hero_title: ["hero_title"],
    hero_subtitle: ["hero_subtitle"],
    hero_description: ["hero_description", "hero_subtitle"],
    hero_eyebrow: ["hero_eyebrow"],
    hero_badge: ["hero_eyebrow"],
    hero_live_badge: ["hero_eyebrow"],
    hero_kicker: ["hero_eyebrow"],
    main_headline: ["hero_title"],
    headline: ["hero_title"],
    challenge_name: ["hero_title"],
    challenge_box_name: ["hero_title"],
    // Subtitles / descriptions
    hero_intro: ["hero_description", "hero_subtitle"],
    value_box_title: ["problem_title"],
    value_box_highlight: ["solution_title"],
    value_box_description: ["solution_description"],
    // Problem
    problem_title: ["problem_title"],
    problem_section_title: ["problem_title"],
    empathy_title: ["problem_title"],
    problem_description: ["problem_description"],
    problem_intro: ["problem_description"],
    // Solution
    solution_title: ["solution_title"],
    solution_section_title: ["solution_title"],
    offer_title: ["solution_title"],
    offer_hook: ["solution_title"],
    method_title: ["solution_title"],
    // Benefits
    benefits_title: ["benefits_title"],
    benefits_section_title: ["benefits_title"],
    // Program
    program_section_title: ["program_title"],
    program_title: ["program_title"],
    content_title: ["program_title"],
    // About / Authority
    about_title: ["about_title"],
    about_section_title: ["about_title"],
    about_name: ["about_name"],
    about_description: ["about_description"],
    about_text: ["about_description"],
    about_offer_question: ["about_title"],
    trainer_name: ["about_name"],
    speaker_name: ["about_name"],
    expert_name: ["about_name"],
    coach_name: ["about_name"],
    trainer_title: ["about_name"],
    // Testimonials
    testimonials_title: ["testimonials_title"],
    testimonials_section_title: ["testimonials_title"],
    // Bonuses
    bonus_section_title: ["bonuses_title"],
    bonuses_section_title: ["bonuses_title"],
    // Guarantee
    guarantee_title: ["guarantee_title"],
    guarantee_text: ["guarantee_text"],
    guarantee_description: ["guarantee_text"],
    // Price
    price_title: ["price_title"],
    pricing_section_title: ["price_title"],
    price_amount: ["price_amount"],
    price_current: ["price_amount"],
    offer_price: ["price_amount"],
    price_old: ["price_old"],
    offer_price_old: ["price_old"],
    price_note: ["price_note"],
    price_label: ["price_title"],
    // Urgency
    urgency_text: ["urgency_text"],
    countdown_label: ["urgency_text"],
    timer_label: ["urgency_text"],
    counter_label: ["urgency_text"],
    timing_title: ["urgency_text"],
    top_banner_text: ["alert_banner_text"],
    alert_banner_text: ["alert_banner_text"],
    // FAQ
    faq_title: ["faq_title"],
    faq_section_title: ["faq_title"],
    // CTA
    cta_text: ["cta_text"],
    cta_primary_text: ["cta_text"],
    cta_main_text: ["cta_text"],
    cta_button_text: ["cta_text"],
    top_cta_text: ["cta_text"],
    cta_subtitle: ["cta_subtitle"],
    cta_subtext: ["cta_subtitle"],
    // Final
    final_title: ["final_title"],
    final_section_title: ["final_title"],
    final_cta_title: ["final_title"],
    final_description: ["final_description"],
    final_cta_text: ["final_description"],
    // Nav / Logo / Footer
    logo_text: ["logo_text"],
    hero_logo: ["logo_text"],
    footer_logo: ["logo_text"],
    footer_text: ["footer_text"],
    footer_copyright: ["footer_text"],
    footer_disclaimer: ["footer_text"],
    // Social proof
    social_proof_text: ["social_proof_text"],
    // Situation / Qualification
    situation_section_title: ["problem_title"],
    secret_section_title: ["solution_title"],
    disclaimer_text: ["cta_subtitle"],
    video_cta_banner: ["cta_text"],
    // Additional
    steps_section_title: ["program_title"],
    formations_section_title: ["program_title"],
  };

  // Fill template-specific fields from universal data
  for (const tplField of Object.keys(stringSelectors)) {
    if (mapped[tplField] != null && mapped[tplField] !== "") continue; // already has a value

    const sources = STRING_MAP[tplField];
    if (sources) {
      for (const src of sources) {
        const val = universalData[src];
        if (val != null && val !== "") {
          mapped[tplField] = val;
          break;
        }
      }
    }
  }

  // --- ARRAY FIELD MAPPING ---
  const ARRAY_MAP: Record<string, { source: string; fieldMap?: Record<string, string> }> = {
    // Navigation
    nav_links: { source: "nav_links" },
    // Benefits / bullets
    hero_bullets: { source: "benefits" },
    benefits_list: { source: "benefits" },
    bullet_points: { source: "benefits" },
    qualification_list: { source: "benefits" },
    trust_badges: { source: "benefits" },
    // Problem
    problem_list: { source: "problem_bullets" },
    problem_bullets: { source: "problem_bullets" },
    questions: { source: "problem_bullets" },
    situations: { source: "problem_bullets" },
    // Comparison
    comparison_before: { source: "problem_bullets" },
    comparison_after: { source: "benefits" },
    // Program / Modules / Steps
    program_days: {
      source: "program_items",
      fieldMap: { day_badge: "label", day_label: "label", day_title: "title", day_date: "label", day_bullets: "description" },
    },
    modules: {
      source: "program_items",
      fieldMap: { module_label: "label", module_title: "title", module_description: "description" },
    },
    steps: {
      source: "program_items",
      fieldMap: { step_number: "label", step_title: "title", step_text: "description" },
    },
    tracks: {
      source: "program_items",
      fieldMap: { track_title: "title", track_description: "description", track_label: "label" },
    },
    formations: {
      source: "program_items",
      fieldMap: { formation_badge: "label", formation_title: "title", formation_meta: "description" },
    },
    info_cards: {
      source: "program_items",
      fieldMap: { info_title: "title", info_text: "description" },
    },
    // Testimonials
    testimonials: {
      source: "testimonials",
      fieldMap: {
        testimonial_text: "content",
        testimonial_content: "content",
        author_name: "author_name",
        testimonial_author: "author_name",
        author_role: "author_role",
        author_stars: "author_role",
        author_rating: "author_role",
      },
    },
    visual_testimonials: {
      source: "testimonials",
      fieldMap: { testimonial_text: "content", author_name: "author_name" },
    },
    // Bonuses
    bonuses: {
      source: "bonuses",
      fieldMap: {
        bonus_title: "title",
        bonus_name: "title",
        bonus_description: "description",
        bonus_text: "description",
        bonus_number: "title",
      },
    },
    bonuses_detailed: {
      source: "bonuses",
      fieldMap: { bonus_title: "title", bonus_description: "description" },
    },
    bonus_cards: {
      source: "bonuses",
      fieldMap: { bonus_title: "title", bonus_text: "description" },
    },
    // FAQ
    faqs: {
      source: "faqs",
      fieldMap: { faq_question: "question", faq_answer: "answer" },
    },
    faq_items: {
      source: "faqs",
      fieldMap: { faq_question: "question", faq_answer: "answer" },
    },
    // Pricing tiers (map from a single price into a simple array if needed)
    pricing_tiers: { source: "_pricing_tiers" },
    // Methods (map from program_items)
    methods: {
      source: "program_items",
      fieldMap: { method_badge: "label", method_title: "title", method_description: "description" },
    },
    // Benefits blocks
    benefits_blocks: {
      source: "_benefits_blocks",
    },
    // Footer
    footer_links: { source: "footer_links" },
  };

  for (const tplArray of Object.keys(arraySelectors)) {
    if (mapped[tplArray] != null) continue; // already has value

    const mapDef = ARRAY_MAP[tplArray];
    if (!mapDef) continue;

    const sourceArr = universalData[mapDef.source];
    if (!Array.isArray(sourceArr) || sourceArr.length === 0) continue;

    if (!mapDef.fieldMap) {
      // Direct copy (string arrays)
      mapped[tplArray] = sourceArr;
      continue;
    }

    // Map object array fields
    mapped[tplArray] = sourceArr.map((item: any) => {
      if (typeof item === "string") return item;
      const out: Record<string, any> = {};
      for (const [tplFieldName, uniFieldName] of Object.entries(mapDef.fieldMap!)) {
        out[tplFieldName] = item[uniFieldName] || "";
      }
      return out;
    });
  }

  return mapped;
}
