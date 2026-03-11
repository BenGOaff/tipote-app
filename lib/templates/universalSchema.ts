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
  pageTypes: ("capture" | "sales" | "showcase")[]; // which page types use this field
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
    description: "Nom de la marque ou de l'offre (source: user branding).",
    required: true,
    pageTypes: ["capture"],
    maxLength: 25,
  },
  {
    key: "logo_subtitle",
    kind: "scalar",
    label: "Baseline du logo",
    description: "Slogan ou baseline courte de la marque (3-5 mots max). Ex: 'Ton business, automatisé.'",
    required: false,
    pageTypes: ["capture"],
    maxLength: 40,
  },
  // --- Hero (au-dessus de la ligne de flottaison) ---
  {
    key: "hook",
    kind: "scalar",
    label: "Hook / Accroche",
    description: "Affirmation choc en MAJUSCULES qui capte l'attention en 1 seconde. Ex: 'ARRÊTE DE PERDRE DU TEMPS', 'LE SECRET DES TOP PERFORMERS'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 60,
  },
  {
    key: "hero_eyebrow",
    kind: "scalar",
    label: "Sur-titre hero",
    description: "Badge ou label court au-dessus du titre (type d'offre, exclusivité). Ex: 'GUIDE GRATUIT', 'MASTERCLASS OFFERTE'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 50,
  },
  {
    key: "hero_title",
    kind: "scalar",
    label: "Titre principal (headline)",
    description: "Promesse de valeur irrésistible, spécifique, orientée résultat. DOIT créer de la curiosité ou de l'urgence. C'est L'ÉLÉMENT LE PLUS IMPORTANT de la page.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 120,
  },
  {
    key: "hero_subtitle",
    kind: "scalar",
    label: "Sous-titre hero",
    description: "Complète la promesse : précise le mécanisme, le public cible, le résultat concret. Élimine la première objection.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 160,
  },
  {
    key: "hero_description",
    kind: "scalar",
    label: "Paragraphe hero",
    description: "Paragraphe d'amplification (2-3 phrases) qui développe la promesse avec empathie et spécificité. Explique pourquoi le visiteur devrait s'inscrire MAINTENANT.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 350,
  },
  // --- Header bar (urgency / target audience) ---
  {
    key: "header_bar_text",
    kind: "scalar",
    label: "Texte barre supérieure",
    description: "Court message d'urgence ou de ciblage affiché dans le bandeau header. Ex: 'Pour les solopreneurs qui veulent scaler', 'Offre limitée : 48h restantes'. PAS de 'Ce template est offert'. JAMAIS de mention du template.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  // --- Hero visual description (for AI-generated illustration) ---
  {
    key: "hero_visual_type",
    kind: "scalar",
    label: "Type de visuel hero",
    description: "Type du visuel à générer dans la section hero. Choisis EXACTEMENT parmi : 'saas_dashboard' (pour SaaS/outil/app), 'ebook_cover' (pour ebook/guide/PDF), 'video_call' (pour coaching/call/consultation), 'checklist' (pour checklist/template/workbook), 'calendar' (pour challenge/programme sur plusieurs jours), 'certificate' (pour formation/certification), 'chat_interface' (pour chatbot/IA/assistant). Choisis le type le plus pertinent pour l'offre.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 30,
  },
  {
    key: "hero_visual_title",
    kind: "scalar",
    label: "Titre affiché dans le visuel",
    description: "Texte court affiché dans le mockup/illustration du hero. Doit refléter le contenu de l'offre. Ex: 'Plan stratégique', 'Guide complet du SEO', 'Coaching personnalisé'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 60,
  },
  {
    key: "hero_visual_subtitle",
    kind: "scalar",
    label: "Sous-titre du visuel",
    description: "Texte secondaire dans le mockup. Ex: 'Objectif : 5 000€/mois', '47 pages de stratégie', 'Session de 45 min'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 60,
  },
  {
    key: "hero_visual_items",
    kind: "array_scalar",
    label: "Éléments du visuel",
    description: "3-5 éléments courts affichés dans le mockup (menu items, chapitres, étapes, features). Ex: ['Tableau de bord', 'Stratégie', 'Content Hub', 'Calendrier'].",
    required: false,
    pageTypes: ["capture"],
    minItems: 3,
    maxItems: 5,
    itemMaxLength: 30,
  },
  {
    key: "hero_visual_metrics",
    kind: "array_object",
    label: "Métriques flottantes du visuel",
    description: "2-3 cartes flottantes avec statistique/résultat autour du mockup. Ex: { icon: '📈', value: '+127', label: 'Leads ce mois' }.",
    required: false,
    pageTypes: ["capture"],
    minItems: 2,
    maxItems: 3,
    subFields: [
      { key: "icon", label: "Emoji (1 seul)", maxLength: 5 },
      { key: "value", label: "Valeur/titre court", maxLength: 25 },
      { key: "label", label: "Label descriptif", maxLength: 30 },
    ],
  },
  // --- Puces promesses (bénéfices) ---
  {
    key: "benefits_title",
    kind: "scalar",
    label: "Titre section bénéfices",
    description: "Introduit les bénéfices clés. Ex: 'Ce que tu vas découvrir', 'Dans ce guide, tu apprendras à...'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  {
    key: "benefits",
    kind: "array_scalar",
    label: "Puces promesses (bénéfices)",
    description: "Chaque puce = 1 bénéfice concret + conséquence positive. Phrase COURTE mais convaincante (6-12 mots). Format : 'Bénéfice précis pour [conséquence]'. JAMAIS de texte placeholder.",
    required: true,
    pageTypes: ["capture"],
    minItems: 3,
    maxItems: 5,
    itemMaxLength: 80,
  },
  // --- Points de douleur / Identification ---
  {
    key: "problem_bullets",
    kind: "array_scalar",
    label: "Points de douleur / Identification",
    description: "Situations frustrantes que vit le prospect. Le prospect doit se dire 'c'est exactement moi'. Phrase à la 2ème personne. Ex: 'Tu passes des heures à créer du contenu sans résultat'.",
    required: false,
    pageTypes: ["capture"],
    minItems: 3,
    maxItems: 5,
    itemMaxLength: 100,
  },
  // --- Programme / Contenu de l'offre gratuite ---
  {
    key: "program_title",
    kind: "scalar",
    label: "Titre du programme/contenu",
    description: "Introduit le contenu de l'offre gratuite. Ex: 'Au programme de cette masterclass', 'Ce guide en 3 étapes'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  {
    key: "program_items",
    kind: "array_object",
    label: "Étapes / Modules / Jours",
    description: "Contenu détaillé de l'offre gratuite. Adapte le vocabulaire (modules, étapes, jours, chapitres).",
    required: false,
    pageTypes: ["capture"],
    minItems: 3,
    maxItems: 5,
    subFields: [
      { key: "label", label: "Étiquette (JOUR 1, ÉTAPE 1, etc.)", maxLength: 20 },
      { key: "title", label: "Titre de l'étape", maxLength: 80 },
      { key: "description", label: "Description courte (1 phrase)", maxLength: 150 },
    ],
  },
  // --- Social proof ---
  {
    key: "social_proof_text",
    kind: "scalar",
    label: "Preuve sociale",
    description: "Chiffre ou fait de crédibilité (ex: '2 500+ entrepreneurs accompagnés', 'Recommandé par 98% des participants').",
    required: false,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  // --- About / Authority ---
  {
    key: "about_title",
    kind: "scalar",
    label: "Titre section À propos",
    description: "Introduit l'auteur. Ex: 'Qui suis-je ?', 'Présenté par', 'Ton formateur'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 50,
  },
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
    label: "Bio / Storytelling de l'auteur",
    description: "Brief storytelling (3-5 phrases) : parcours, expertise, résultats obtenus. Le prospect doit se dire que l'auteur a vécu la même chose et a réussi. Crédibilité + connexion humaine.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 400,
  },
  // --- Testimonials (if user has provided them) ---
  {
    key: "testimonials",
    kind: "array_object",
    label: "Témoignages",
    description: "Témoignages réels fournis par l'utilisateur. NE JAMAIS INVENTER de témoignages. Laisser un tableau vide si aucun témoignage fourni.",
    required: false,
    pageTypes: ["capture"],
    minItems: 0,
    maxItems: 4,
    subFields: [
      { key: "content", label: "Texte du témoignage", maxLength: 200 },
      { key: "author_name", label: "Nom", maxLength: 40 },
    ],
  },
  // --- CTA ---
  {
    key: "cta_text",
    kind: "scalar",
    label: "Texte CTA principal",
    description: "Verbe d'action orienté résultat, 2-5 mots. Ex: 'Je télécharge mon guide', 'J'accède à la masterclass'. JAMAIS 'Cliquer ici' ou 'Soumettre'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 40,
  },
  {
    key: "cta_subtitle",
    kind: "scalar",
    label: "Sous-texte CTA",
    description: "Réassurance sous le bouton. Ex: '100% gratuit, zéro spam', 'Accès immédiat par email'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 50,
  },
  // --- Final push ---
  {
    key: "final_title",
    kind: "scalar",
    label: "Titre CTA final",
    description: "Dernière accroche avant le bouton final (bas de page). Résume pourquoi agir maintenant.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 100,
  },
  {
    key: "final_description",
    kind: "scalar",
    label: "Paragraphe CTA final",
    description: "Dernier paragraphe émotionnel qui pousse à l'action.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 250,
  },
  // --- Footer ---
  {
    key: "footer_text",
    kind: "scalar",
    label: "Texte footer",
    description: "Copyright ou mention légale courte. Ex: '© 2025 NomMarque · Tous droits réservés'.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 100,
  },
  // --- Thank-you page (shown after form submission) ---
  {
    key: "thank_you_title",
    kind: "scalar",
    label: "Titre page de remerciements",
    description: "Titre affiché après inscription. Doit confirmer et féliciter. Ex: 'Bravo, tu fais partie de l'aventure !', 'C'est fait ! Ton accès arrive...'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 80,
  },
  {
    key: "thank_you_message",
    kind: "scalar",
    label: "Message de remerciements",
    description: "Message complet après inscription (2-3 phrases). Confirme ce que le prospect va recevoir, quand, et quelle est la prochaine étape. Ex: 'Tu vas recevoir ton guide par email dans les 5 prochaines minutes. Pense à vérifier tes spams !'.",
    required: true,
    pageTypes: ["capture"],
    maxLength: 250,
  },
  {
    key: "thank_you_cta_text",
    kind: "scalar",
    label: "Texte bouton page de remerciements",
    description: "Texte optionnel d'un bouton CTA sur la page de remerciements (ex: 'Découvrir mon offre', 'Rejoindre la communauté'). Laisser vide si pas de CTA secondaire.",
    required: false,
    pageTypes: ["capture"],
    maxLength: 40,
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

// ---------- UNIVERSAL SHOWCASE SCHEMA ----------

const SHOWCASE_FIELDS: UniversalField[] = [
  // --- Brand / Logo ---
  {
    key: "logo_text",
    kind: "scalar",
    label: "Texte du logo",
    description: "Nom de la marque ou de l'entreprise.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 25,
  },
  {
    key: "nav_links",
    kind: "array_scalar",
    label: "Navigation",
    description: "Ancres de navigation (noms des sections). Ex: 'Services', 'À propos', 'Tarifs', 'FAQ', 'Contact'. Chaque lien sera ancré automatiquement vers la section correspondante.",
    required: true,
    pageTypes: ["showcase"],
    minItems: 3,
    maxItems: 6,
    itemMaxLength: 20,
  },
  // --- Hero ---
  {
    key: "hero_eyebrow",
    kind: "scalar",
    label: "Badge hero",
    description: "Label court au-dessus du titre. Ex: 'Coach certifié', 'SaaS #1', 'Consultant expert'.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 50,
  },
  {
    key: "hero_title",
    kind: "scalar",
    label: "Titre principal",
    description: "Proposition de valeur claire en 1 phrase. Doit expliquer ce que fait l'entreprise et pour qui. Ex: 'Automatise ta prospection et génère 3x plus de leads'.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 120,
  },
  {
    key: "hero_subtitle",
    kind: "scalar",
    label: "Sous-titre hero",
    description: "Développe la proposition de valeur : pour qui, quel résultat concret, en combien de temps.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 180,
  },
  {
    key: "hero_description",
    kind: "scalar",
    label: "Description hero",
    description: "Paragraphe d'amplification optionnel (2-3 phrases).",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 300,
  },
  {
    key: "cta_text",
    kind: "scalar",
    label: "CTA principal",
    description: "Texte du bouton principal. Ex: 'Prendre rendez-vous', 'Essayer gratuitement', 'Découvrir nos services'.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 40,
  },
  {
    key: "secondary_cta_text",
    kind: "scalar",
    label: "CTA secondaire",
    description: "Texte du bouton secondaire (optionnel). Ex: 'En savoir plus', 'Voir la démo', 'Nous contacter'.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 40,
  },
  // --- Services ---
  {
    key: "services_title",
    kind: "scalar",
    label: "Titre section services",
    description: "Introduit les services/fonctionnalités. Ex: 'Nos services', 'Ce que nous proposons', 'Nos fonctionnalités'.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  {
    key: "services_subtitle",
    kind: "scalar",
    label: "Sous-titre section services",
    description: "Phrase d'accroche pour la section services.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 160,
  },
  {
    key: "services",
    kind: "array_object",
    label: "Services / Fonctionnalités",
    description: "Liste des services ou fonctionnalités proposés. 3-6 items.",
    required: true,
    pageTypes: ["showcase"],
    minItems: 3,
    maxItems: 6,
    subFields: [
      { key: "icon", label: "Emoji (1 seul)", maxLength: 5 },
      { key: "title", label: "Nom du service", maxLength: 60 },
      { key: "description", label: "Description courte (1-2 phrases)", maxLength: 200 },
    ],
  },
  // --- Key numbers ---
  {
    key: "numbers_title",
    kind: "scalar",
    label: "Titre chiffres clés",
    description: "Titre optionnel pour la section chiffres clés.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 60,
  },
  {
    key: "key_numbers",
    kind: "array_object",
    label: "Chiffres clés",
    description: "Statistiques ou chiffres qui crédibilisent (clients, projets, années). 3-4 items. NE PAS inventer de chiffres si non fournis.",
    required: false,
    pageTypes: ["showcase"],
    minItems: 3,
    maxItems: 4,
    subFields: [
      { key: "value", label: "Chiffre (ex: '150+', '10 ans', '98%')", maxLength: 15 },
      { key: "label", label: "Label (ex: 'Clients accompagnés')", maxLength: 40 },
    ],
  },
  // --- Benefits ---
  {
    key: "benefits_title",
    kind: "scalar",
    label: "Titre section avantages",
    description: "Pourquoi choisir cette offre/entreprise.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  {
    key: "benefits",
    kind: "array_scalar",
    label: "Avantages clés",
    description: "4-6 avantages concrets de travailler avec cette entreprise.",
    required: true,
    pageTypes: ["showcase"],
    minItems: 4,
    maxItems: 6,
    itemMaxLength: 100,
  },
  // --- Program / Process ---
  {
    key: "program_title",
    kind: "scalar",
    label: "Titre du processus/méthode",
    description: "Introduit la méthode de travail. Ex: 'Comment ça marche', 'Notre processus', 'En 3 étapes'.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  {
    key: "program_items",
    kind: "array_object",
    label: "Étapes du processus",
    description: "Étapes de collaboration/méthode de travail (3-5 items).",
    required: false,
    pageTypes: ["showcase"],
    minItems: 3,
    maxItems: 5,
    subFields: [
      { key: "label", label: "Étiquette (ÉTAPE 1, etc.)", maxLength: 20 },
      { key: "title", label: "Titre", maxLength: 80 },
      { key: "description", label: "Description", maxLength: 200 },
    ],
  },
  // --- About ---
  {
    key: "about_title",
    kind: "scalar",
    label: "Titre section À propos",
    description: "Introduit le fondateur/l'équipe.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 60,
  },
  {
    key: "about_name",
    kind: "scalar",
    label: "Nom du fondateur/expert",
    description: "Nom complet.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 50,
  },
  {
    key: "about_description",
    kind: "scalar",
    label: "Bio / Storytelling",
    description: "Parcours, expertise, mission. Crédibilité + connexion humaine.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 500,
  },
  // --- Testimonials ---
  {
    key: "testimonials_title",
    kind: "scalar",
    label: "Titre section témoignages",
    description: "Ex: 'Ce que disent nos clients'.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 60,
  },
  {
    key: "testimonials",
    kind: "array_object",
    label: "Témoignages",
    description: "Témoignages réels. NE JAMAIS INVENTER.",
    required: false,
    pageTypes: ["showcase"],
    minItems: 0,
    maxItems: 6,
    subFields: [
      { key: "content", label: "Texte", maxLength: 300 },
      { key: "author_name", label: "Nom", maxLength: 50 },
      { key: "author_role", label: "Rôle/titre", maxLength: 50 },
    ],
  },
  // --- Pricing (optional) ---
  {
    key: "price_title",
    kind: "scalar",
    label: "Titre section tarifs",
    description: "Ex: 'Nos tarifs', 'Choisissez votre formule'. Laisser vide si pas de tarif public.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  {
    key: "price_amount",
    kind: "scalar",
    label: "Prix principal",
    description: "Prix unique si applicable. Source: user input.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 20,
  },
  {
    key: "price_note",
    kind: "scalar",
    label: "Note sous le prix",
    description: "Précision tarifaire (ex: 'à partir de', 'sur devis', '/mois').",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  // --- FAQ ---
  {
    key: "faq_title",
    kind: "scalar",
    label: "Titre FAQ",
    description: "Ex: 'Questions fréquentes'.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 60,
  },
  {
    key: "faqs",
    kind: "array_object",
    label: "FAQ",
    description: "Questions fréquentes avec réponses complètes.",
    required: false,
    pageTypes: ["showcase"],
    minItems: 3,
    maxItems: 8,
    subFields: [
      { key: "question", label: "Question", maxLength: 100 },
      { key: "answer", label: "Réponse", maxLength: 300 },
    ],
  },
  // --- Contact ---
  {
    key: "contact_title",
    kind: "scalar",
    label: "Titre section contact",
    description: "Ex: 'Contactez-nous', 'Prêt à démarrer ?'.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 80,
  },
  {
    key: "contact_description",
    kind: "scalar",
    label: "Description section contact",
    description: "Phrase d'incitation au contact.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 200,
  },
  {
    key: "contact_cta_text",
    kind: "scalar",
    label: "Texte CTA contact",
    description: "Ex: 'Prendre rendez-vous', 'Demander un devis', 'Essai gratuit'.",
    required: true,
    pageTypes: ["showcase"],
    maxLength: 40,
  },
  // --- Footer ---
  {
    key: "footer_text",
    kind: "scalar",
    label: "Texte footer",
    description: "Copyright ou mention légale courte.",
    required: false,
    pageTypes: ["showcase"],
    maxLength: 100,
  },
];

// ---------- Public API ----------

export function getUniversalSchema(pageType: "capture" | "sales" | "showcase"): UniversalField[] {
  if (pageType === "capture") return CAPTURE_FIELDS;
  if (pageType === "showcase") return SHOWCASE_FIELDS;
  return SALES_FIELDS;
}

/**
 * Convert the universal schema into a prompt for the AI.
 * This replaces the per-template schemaToPrompt() function.
 */
export function universalSchemaToPrompt(pageType: "capture" | "sales" | "showcase"): string {
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
  lines.push("- ZÉRO emoji SAUF dans hero_visual_metrics[].icon (1 emoji par carte pour l'icône).");
  lines.push("- Les strings : 1-2 phrases max, pas de sauts de ligne.");
  lines.push("- Les puces promesses (benefits) : phrase COURTE mais convaincante (6-12 mots), bénéfice + conséquence.");
  lines.push("- CTA : verbe d'action clair, 2-5 mots, orienté résultat.");
  lines.push("- Style : premium, direct, très lisible. Zéro blabla.");
  lines.push("- about_description : 3-5 phrases de storytelling avec crédibilité et connexion humaine.");
  lines.push("- hero_description : 2-3 phrases d'amplification qui développent la promesse.");
  lines.push("- FAQ : chaque item DOIT avoir question ET réponse complète (2-3 phrases).");

  return lines.join("\n");
}

// ---------- Template content mapping (DEPRECATED — kept as no-op for backward compat) ----------

/**
 * @deprecated Template system removed. This function now returns data as-is.
 * Kept for backward compatibility with any code that still imports it.
 */
export function mapUniversalToTemplate(
  universalData: Record<string, any>,
  _templateSelectors?: Record<string, any>,
): Record<string, any> {
  return { ...universalData };
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Original mapping code removed — pages are now built programmatically via lib/pageBuilder.ts.
// The template system (STRING_MAP, ARRAY_MAP, selectors.json) is no longer needed.
/* eslint-enable @typescript-eslint/no-unused-vars */

// Legacy code removed below (STRING_MAP, ARRAY_MAP, field mapping logic)
// was used to map universal fields to template-specific placeholders.
// Now that templates are gone, this code serves no purpose.

