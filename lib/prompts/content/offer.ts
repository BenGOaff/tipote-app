// lib/prompts/content/offer.ts
// Génération d'offres Tipote :
// - Lead Magnet (gratuit)
// - Offre payante / formation
// - Amélioration d'une offre existante
// Objectif : livrable final structuré, stratégique et actionnable
// Sortie : TEXTE BRUT (plain text), prêt à être utilisé

export type OfferType = "lead_magnet" | "paid_training";
export type OfferMode = "from_existing" | "from_scratch" | "improve";

export type OfferSourceContext = {
  id?: string;
  name?: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  price_min?: number | null;
  price_max?: number | null;
};

export type OfferPromptParams = {
  offerType: OfferType;

  // ✅ Mode explicite
  offerMode?: OfferMode;

  // ✅ Zéro: sujet (uniquement si from_scratch)
  theme?: string;

  // ✅ Lead magnet (zéro): format demandé côté UI
  leadMagnetFormat?: string;

  // ✅ Contexte offre existante (si offerMode === from_existing ou improve)
  sourceOffer?: OfferSourceContext | null;

  // ✅ Improve: direction d'amélioration décrite par l'user
  improvementGoal?: string;

  // Contexte enrichi (injecté automatiquement par route.ts)
  language?: string; // défaut fr
};

function safe(s?: string) {
  return (s ?? "").trim();
}

function compactJson(obj: any) {
  try {
    return JSON.stringify(obj ?? null);
  } catch {
    return String(obj ?? "");
  }
}

function pickString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function inferOfferNameFromSource(sourceOffer: OfferSourceContext | null): string {
  const name = pickString(sourceOffer?.name);
  if (name) return name;
  // fallback doux: essaye description/promise
  const p = pickString(sourceOffer?.promise);
  if (p) return p.slice(0, 80);
  const d = pickString(sourceOffer?.description);
  if (d) return d.slice(0, 80);
  return "Offre existante";
}

export function buildOfferPrompt(params: OfferPromptParams): string {
  if (params.offerMode === "improve") {
    return buildOfferImprovementPrompt(params);
  }

  const lang = safe(params.language) || "fr";
  const offerType = params.offerType;
  const mode: OfferMode = params.offerMode === "from_existing" ? "from_existing" : "from_scratch";

  const theme = safe(params.theme);
  const leadMagnetFormat = safe(params.leadMagnetFormat);
  const sourceOffer = params.sourceOffer ?? null;

  // ✅ Posture V2 (dynamique par catégorie)
  // Ici: Création d'offres / structuration business => FORMATEUR & STRATÈGE EXPERT
  const roleAndPosture = [
    "RÔLE & POSTURE (V2 — OFFRES / STRUCTURATION BUSINESS) :",
    "Tu es un formateur business senior et un stratège spécialisé dans la création d’offres claires, désirables et actionnables.",
    "Tu structures des offres alignées avec la réalité du marché, la maturité de l’audience et les objectifs business.",
    "Tu vises une valeur perçue exceptionnelle (niveau premium), sans blabla ni remplissage.",
    "Tu ne mentionnes jamais que tu es une IA.",
  ].join("\n");

  const outputRules = [
    "CONTRAINTES DE SORTIE :",
    "- Sortie = TEXTE BRUT (plain text).",
    "- Interdit: markdown, titres avec #, emojis excessifs, disclaimers, meta-explications.",
    "- Structure: sauts de lignes + puces '- ' uniquement si nécessaire.",
    "- Ton: clair, pro, actionnable, précis.",
  ].join("\n");

  const globalContext = [
    "CONTEXTE À EXPLOITER (INJECTÉ PAR L'API, NE PAS RÉPÉTER MOT POUR MOT) :",
    "- Persona client idéal: douleurs, désirs, objections, vocabulaire.",
    "- Business profile + business plan (si disponibles).",
    "- Ressources Tipote Knowledge (si présentes).",
    "- Si une offre source (existante) est fournie: tu DOIS t'y aligner et ne pas inventer son existence.",
  ].join("\n");

  const strategyRules = [
    "EXIGENCE DE QUALITÉ (IMPORTANT) :",
    "- Tu dois proposer un rendu tellement solide qu'il pourrait être vendu 10 000€.",
    "- Tu anticipes les cas de figure: cible froide vs tiède, objections, maturité, contraintes d'exécution.",
    "- Tu donnes des exemples concrets, des frameworks, des scripts, des checklists, des livrables, des templates.",
    "- Tu fais des choix: tu ne listes pas 50 options. Tu proposes, tu justifies, tu verrouilles une direction.",
  ].join("\n");

  const sourceBlock =
    mode === "from_existing"
      ? [
          "OFFRE SOURCE (EXISTANTE) :",
          "Tu disposes d'une offre existante. Tu dois la développer et la rendre exploitable.",
          "Données source (JSON):",
          compactJson(sourceOffer),
          "",
          "RÈGLES OFFRE SOURCE :",
          "- Ne demande pas le thème: il est déduit de l'offre source.",
          "- Ne renomme pas arbitrairement l'offre source si son nom est fourni.",
          "- Si un champ manque, tu complètes intelligemment en restant cohérent avec persona + business plan + knowledge.",
          "- Ta sortie doit être alignée avec la logique des offres (lead magnet -> offre payante, etc.).",
        ].join("\n")
      : "";

  /* =========================
     LEAD MAGNET
     ========================= */
  if (offerType === "lead_magnet") {
    const lmModeInstructions =
      mode === "from_existing"
        ? [
            "MODE : CRÉER LE LEAD MAGNET À PARTIR D'UNE OFFRE EXISTANTE",
            "Tu produis le lead magnet final en te basant sur l'offre source (nom / promesse / but / contenu implicite).",
            "Tu optimises la conversion (capture email) ET la cohérence avec l'offre payante à venir.",
          ].join("\n")
        : [
            "MODE : CRÉER UN LEAD MAGNET À PARTIR DE ZÉRO",
            "Tu te bases sur la niche + persona + business plan (fournis par l'API).",
            "Tu dois utiliser le sujet fourni et le format demandé.",
            "Tu délivres un 'quick win' immédiat et tu prepares naturellement la vente d'une offre payante.",
          ].join("\n");

    const lmInputs =
      mode === "from_existing"
        ? [
            "INFOS CLÉS À UTILISER :",
            `- Nom (si fourni) : ${inferOfferNameFromSource(sourceOffer)}`,
            `- Promesse / outcome (si fourni) : ${pickString(sourceOffer?.promise) || pickString(sourceOffer?.main_outcome) || "à déduire"}`,
            `- Description (si fournie) : ${pickString(sourceOffer?.description) || "à déduire"}`,
            `- Format / delivery (si fournis) : ${pickString(sourceOffer?.format) || "à choisir"} / ${pickString(sourceOffer?.delivery) || "à préciser"}`,
          ].join("\n")
        : [
            "SUJET DU LEAD MAGNET (OBLIGATOIRE) :",
            theme || "(sujet manquant)",
            "",
            "FORMAT DU LEAD MAGNET (OBLIGATOIRE) :",
            leadMagnetFormat || "(format manquant)",
          ].join("\n");

    const lmFormatRules = [
      "RÈGLES DE FORMAT LEAD MAGNET :",
      "- Si le format est PDF/guide: tu donnes un plan + le contenu section par section + une checklist finale + une page 'résumé' + un CTA.",
      "- Si le format est checklist: tu donnes la checklist + micro-explications + erreurs fréquentes + exemple rempli + CTA.",
      "- Si le format est template: tu donnes le template prêt à copier-coller + 2 exemples remplis + règles d'utilisation + CTA.",
      "- Si le format est quiz: tu donnes questions + choix + logique de scoring + interprétation + recommandations + CTA.",
      "- Si le format est vidéo: tu donnes script + structure + hook + déroulé + call-to-action + mini-plan de montage.",
      "- Si le format est mini-formation: tu donnes modules + leçons + exercices + livrables + 'quick win' dès le module 1 + CTA.",
      "- Dans tous les cas: le prospect doit obtenir un résultat tangible en 10 à 30 minutes.",
    ].join("\n");

    const lmDeliverable = [
      "STRUCTURE ATTENDUE (OBLIGATOIRE) :",
      "1) TITRE PRINCIPAL (orienté bénéfice, très spécifique)",
      "2) PROMESSE PRINCIPALE (transformation claire, mesurable ou ressentie)",
      "3) PROBLÈME CIBLÉ (douleur précise + pourquoi ça bloque aujourd'hui)",
      "4) POUR QUI / POUR QUI PAS (qualification rapide)",
      "5) FORMAT RETENU + POURQUOI (justification courte, pas de blabla)",
      "6) CONTENU COMPLET (selon le format, prêt à livrer)",
      "7) QUICK WIN GUIDÉ (étapes exactes pour obtenir un résultat immédiat)",
      "8) CTA DE CAPTURE (texte + variante courte + variante DM)",
      "9) PONT VERS L'OFFRE PAYANTE (transition logique, non agressive)",
      "10) PLAN D'UTILISATION MARKETING (page de capture, bio, DM, pub, séquence email courte)",
    ].join("\n");

    return [
      roleAndPosture,
      "",
      outputRules,
      "",
      globalContext,
      "",
      strategyRules,
      "",
      mode === "from_existing" ? sourceBlock : "",
      mode === "from_existing" ? "" : "",
      lmModeInstructions,
      "",
      lmInputs,
      "",
      lmFormatRules,
      "",
      lmDeliverable,
      "",
      "IMPORTANT :",
      "- Tu ne poses AUCUNE question. Tu produis directement le livrable final.",
      "- Tu fais des choix fermes (angle, format, structure) et tu assumes.",
      "",
      "Génère maintenant le lead magnet complet.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /* =========================
     OFFRE PAYANTE / FORMATION
     ========================= */
  const ptModeInstructions =
    mode === "from_existing"
      ? [
          "MODE : DÉVELOPPER L'OFFRE PAYANTE À PARTIR D'UNE OFFRE EXISTANTE",
          "Tu développes l'offre existante à partir des infos fournies (sans réinventer l'offre).",
          "Tu renforces: promesse, différenciation, contenu, pédagogie, exécution, valeur perçue, pricing, preuves, objections.",
        ].join("\n")
      : [
          "MODE : CRÉER UNE OFFRE PAYANTE À PARTIR DE ZÉRO",
          "Tu te bases sur la niche + persona + business plan (fournis par l'API).",
          "Tu dois utiliser le sujet fourni (theme).",
          "Tu choisis un format cohérent (self-paced, cohort, hybride, coaching…) et tu justifies.",
        ].join("\n");

  const ptInputs =
    mode === "from_existing"
      ? [
          "INFOS OFFRE SOURCE À UTILISER :",
          `- Nom (si fourni) : ${inferOfferNameFromSource(sourceOffer)}`,
          `- Promesse : ${pickString(sourceOffer?.promise) || "à déduire"}`,
          `- Main outcome : ${pickString(sourceOffer?.main_outcome) || "à déduire"}`,
          `- Description : ${pickString(sourceOffer?.description) || "à déduire"}`,
          `- Format : ${pickString(sourceOffer?.format) || "à choisir/affiner"}`,
          `- Delivery : ${pickString(sourceOffer?.delivery) || "à préciser"}`,
          `- Prix min/max : ${sourceOffer?.price_min ?? "?"} / ${sourceOffer?.price_max ?? "?"}`,
          "",
          "RÈGLE : si le prix est absent, propose une fourchette cohérente avec le marché ET avec les autres offres.",
        ].join("\n")
      : [
          "SUJET DE L'OFFRE (OBLIGATOIRE) :",
          theme || "(sujet manquant)",
        ].join("\n");

  const durRules = [
    "CRITÈRE D.U.R (OBLIGATOIRE) :",
    "- Douloureux: le problème doit coûter cher (temps/argent/opportunité/estime).",
    "- Urgent: le prospect veut résoudre maintenant, pas 'un jour'.",
    "- Reconnu: le problème est déjà exprimé en ligne (symptômes, phrases, frustrations).",
    "- Tu traduis ça en: messages marketing, objections, et structure pédagogique.",
  ].join("\n");

  const ptDeliverable = [
    "STRUCTURE ATTENDUE (OBLIGATOIRE) :",
    "1) NOM DE L'OFFRE (clair, orienté transformation)",
    "2) PROMESSE CENTRALE (résultat final concret + conditions de réussite)",
    "3) QUI C'EST POUR / QUI C'EST PAS (qualification nette)",
    "4) PROBLÈME D.U.R + MESSAGES DU MARCHÉ (phrases exactes que le prospect se dit)",
    "5) MÉCANISME UNIQUE / ANGLE (pourquoi ça marche + en quoi c'est différent)",
    "6) DÉRIVÉE PÉDAGOGIQUE (la méthode en 3-7 étapes)",
    "7) STRUCTURE DU PROGRAMME (8 à 15 modules)",
    "- Pour chaque module: objectif, livrable, exercice, résultat attendu",
    "8) LIVRABLES PREMIUM",
    "- templates, scripts, checklists, dashboards, prompts, etc.",
    "9) PARCOURS D'EXÉCUTION",
    "- planning recommandé (2, 4 ou 8 semaines selon format) + charge de travail",
    "10) OBJECTIONS & RÉPONSES",
    "- au moins 8 objections réalistes + réponses",
    "11) PRICING & PACKAGING",
    "- 3 options (ex: Essential / Pro / Elite) + quoi inclure + fourchette de prix",
    "12) PLAN DE PREUVES",
    "- quoi mesurer / quoi montrer / mini-cas d'étude type",
    "13) PLAN DE VENTE (résumé)",
    "- 1 hook, 1 pitch court, 1 pitch long, 1 CTA",
  ].join("\n");

  return [
    roleAndPosture,
    "",
    outputRules,
    "",
    globalContext,
    "",
    strategyRules,
    "",
    mode === "from_existing" ? sourceBlock : "",
    mode === "from_existing" ? "" : "",
    ptModeInstructions,
    "",
    ptInputs,
    "",
    durRules,
    "",
    ptDeliverable,
    "",
    "IMPORTANT :",
    "- Tu ne poses AUCUNE question. Tu produis directement le livrable final.",
    "- Tu évites le remplissage. Chaque ligne doit augmenter la valeur perçue.",
    "",
    "Génère maintenant l'offre complète.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* =========================
   AMÉLIORATION D'UNE OFFRE EXISTANTE
   ========================= */
function buildOfferImprovementPrompt(params: OfferPromptParams): string {
  const sourceOffer = params.sourceOffer ?? null;
  const improvementGoal = safe(params.improvementGoal);

  return [
    "RÔLE & POSTURE :",
    "Tu es un consultant business senior spécialisé en design d'offres à haute valeur perçue.",
    "Tu analyses une offre existante et proposes des améliorations concrètes et actionnables.",
    "Tu t'appuies sur le persona client, le business plan, les ressources internes et les meilleures pratiques du marché.",
    "Tu ne mentionnes jamais que tu es une IA.",
    "",
    "CONTRAINTES DE SORTIE :",
    "- Sortie = TEXTE BRUT (plain text).",
    "- Interdit: markdown, titres avec #, emojis excessifs.",
    "- Structure: sauts de lignes + puces '- ' uniquement si nécessaire.",
    "- Ton: clair, pro, actionnable, précis.",
    "",
    "OFFRE À ANALYSER :",
    compactJson(sourceOffer),
    "",
    improvementGoal
      ? [
          "DIRECTION D'AMÉLIORATION DEMANDÉE PAR L'UTILISATEUR :",
          improvementGoal,
          "",
          "Tu dois te concentrer sur cette direction tout en restant cohérent avec l'ensemble de l'offre.",
        ].join("\n")
      : "L'utilisateur veut améliorer cette offre globalement. Identifie les axes les plus impactants.",
    "",
    "CONTEXTE À EXPLOITER :",
    "- Persona client idéal (douleurs, désirs, objections, vocabulaire) — injecté par l'API.",
    "- Business profile + business plan (si disponibles).",
    "- Ressources Tipote Knowledge (si présentes).",
    "- Tu croises ces infos avec l'offre pour identifier les gaps et les opportunités.",
    "",
    "STRUCTURE ATTENDUE (OBLIGATOIRE) :",
    "",
    "1) DIAGNOSTIC RAPIDE",
    "- Points forts de l'offre actuelle (2-3 max)",
    "- Points faibles ou manques identifiés (2-4 max)",
    "- Alignement avec le persona et le marché (note sur 10 + justification courte)",
    "",
    "2) AMÉLIORATIONS PROPOSÉES",
    "Pour chaque amélioration (3 à 6 max) :",
    "- Titre clair de l'amélioration",
    "- Pourquoi c'est important (impact business/conversion)",
    "- Ce qu'il faut faire concrètement (actionnable, pas vague)",
    "- Résultat attendu",
    "",
    "3) OFFRE AMÉLIORÉE (RÉSUMÉ)",
    "- Nouveau positionnement / promesse (si changement suggéré)",
    "- Nouvelle structure résumée",
    "- Nouveau pricing recommandé (si pertinent)",
    "",
    "4) TÂCHES À RÉALISER",
    "Liste numérotée de tâches concrètes que l'utilisateur peut exécuter pour appliquer ces améliorations.",
    "Chaque tâche doit être courte (1 phrase), actionnable, et priorisée.",
    "Format strict pour chaque tâche :",
    "TÂCHE: [description courte et actionnable]",
    "Exemple : TÂCHE: Ajouter un bonus vidéo de 15 min dans le lead magnet",
    "Exemple : TÂCHE: Réécrire la promesse principale pour cibler la douleur n°1 du persona",
    "",
    "IMPORTANT :",
    "- Tu ne poses AUCUNE question. Tu produis directement l'analyse et les recommandations.",
    "- Tu fais des choix fermes. Tu ne listes pas 10 options: tu recommandes et tu justifies.",
    "- Les tâches doivent être réalistes et faisables en moins d'1 semaine chacune.",
    "",
    "Génère maintenant l'analyse et les améliorations.",
  ]
    .filter(Boolean)
    .join("\n");
}
