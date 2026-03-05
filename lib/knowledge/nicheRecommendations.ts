// lib/knowledge/nicheRecommendations.ts
// Niche-specific recommendations for AI content generation.
// Provides best practices, vocabulary, tone, and conversion strategies
// tailored to each niche so Tipote generates premium, unique pages.

type NicheRec = {
  /** Vocabulary and expressions specific to this niche */
  vocabulary: string[];
  /** Proven copywriting angles for this niche */
  angles: string[];
  /** Common pain points to exploit */
  painPoints: string[];
  /** Recommended hero_visual_type for different offer types */
  visualDefaults: Record<string, string>;
  /** Tone and style notes */
  toneNotes: string;
};

const NICHE_DB: Record<string, NicheRec> = {
  // ─── COACHING / DÉVELOPPEMENT PERSONNEL ───
  coaching: {
    vocabulary: [
      "transformation", "passage à l'action", "alignement",
      "plein potentiel", "déclic", "zone de génie", "mindset",
      "objectifs", "clarté", "vision", "élan", "débloquer",
    ],
    angles: [
      "Avant/après : la vie avant le coaching vs après",
      "Le coût de l'inaction (rester bloqué encore 6 mois)",
      "L'effet domino : un déclic qui change tout",
      "Social proof : nombre de coachés transformés",
    ],
    painPoints: [
      "Se sentir bloqué malgré les efforts",
      "Procrastiner sur les décisions importantes",
      "Douter de sa légitimité (syndrome de l'imposteur)",
      "Manquer de clarté sur la prochaine étape",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      coaching: "video_call",
      formation: "certificate",
      challenge: "calendar",
      checklist: "checklist",
    },
    toneNotes: "Empathique mais direct. Pas de language 'woo-woo'. Orienté action et résultats concrets. Tutoiement naturel.",
  },

  // ─── MARKETING DIGITAL / BUSINESS EN LIGNE ───
  marketing: {
    vocabulary: [
      "tunnel de vente", "leads", "taux de conversion",
      "audience", "scaling", "automatisation", "ROI",
      "acquisition", "rétention", "LTV", "trafic organique",
      "copywriting", "personal branding", "stratégie de contenu",
    ],
    angles: [
      "Résultats chiffrés (X leads/mois, +X% de conversion)",
      "La méthode step-by-step qu'ils n'ont pas encore essayée",
      "Ce que font les top 1% que les autres ignorent",
      "L'erreur n°1 qui sabote leur business",
    ],
    painPoints: [
      "Créer du contenu sans résultat visible",
      "Avoir un bon produit mais zéro visibilité",
      "Dépenser en pub sans ROI clair",
      "Ne pas savoir par où commencer pour scaler",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      saas: "saas_dashboard",
      formation: "saas_dashboard",
      challenge: "calendar",
      checklist: "checklist",
      template: "checklist",
    },
    toneNotes: "Expert et concret. Chiffres et données. Pas de blabla motivationnel — que du tangible. Ton 'entre pros'.",
  },

  // ─── FITNESS / SANTÉ / BIEN-ÊTRE ───
  fitness: {
    vocabulary: [
      "transformation physique", "routine", "objectifs santé",
      "énergie", "habitudes", "résultats visibles", "programme",
      "nutrition", "entraînement", "récupération", "performance",
      "shape", "motivation", "discipline",
    ],
    angles: [
      "Avant/après photos et témoignages",
      "Le programme que suivent les athlètes pros (simplifié)",
      "Pourquoi les régimes classiques ne marchent pas",
      "Résultats en X semaines (timeline claire)",
    ],
    painPoints: [
      "Commencer et abandonner en boucle",
      "Ne pas voir de résultats malgré les efforts",
      "Manquer de temps pour s'entraîner",
      "Se perdre dans les infos contradictoires",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      programme: "calendar",
      challenge: "calendar",
      coaching: "video_call",
      checklist: "checklist",
    },
    toneNotes: "Motivant sans être toxique. Pas de body-shaming. Focus sur l'énergie et le bien-être, pas que l'apparence.",
  },

  // ─── FREELANCE / SOLOPRENEUR / PRESTATAIRE ───
  freelance: {
    vocabulary: [
      "clients premium", "positionnement", "offre irrésistible",
      "tarifs", "prospection", "liberté financière", "indépendance",
      "portfolio", "expertise", "niche", "valeur perçue",
      "récurrence", "pipeline", "closing",
    ],
    angles: [
      "Passer de X€ à Y€/mois sans travailler plus",
      "Attirer des clients qui paient le juste prix",
      "La méthode pour ne plus courir après les clients",
      "Se différencier dans un marché saturé",
    ],
    painPoints: [
      "Le syndrome du 'je fais tout moi-même'",
      "Avoir des mois à zéro entre deux missions",
      "Ne pas oser augmenter ses tarifs",
      "Se sentir remplaçable et mal payé",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      formation: "saas_dashboard",
      template: "checklist",
      coaching: "video_call",
      challenge: "calendar",
    },
    toneNotes: "Pragmatique et concret. Parler comme un freelance à un freelance. Pas de corporate ni de jargon startup.",
  },

  // ─── E-COMMERCE / PRODUIT PHYSIQUE ───
  ecommerce: {
    vocabulary: [
      "panier moyen", "taux de conversion", "fiche produit",
      "abandon de panier", "upsell", "cross-sell", "stock",
      "livraison", "avis clients", "marketplace", "Shopify",
      "dropshipping", "marque", "packaging",
    ],
    angles: [
      "Le produit que X personnes s'arrachent",
      "Qualité premium à prix accessible",
      "Garanti satisfait ou remboursé",
      "Offre limitée / stock restant",
    ],
    painPoints: [
      "Avoir du trafic mais peu de ventes",
      "Des abandons de panier massifs",
      "Pas assez de marge pour scaler en pub",
      "Se battre sur les prix face aux concurrents",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      formation: "saas_dashboard",
      checklist: "checklist",
      template: "checklist",
    },
    toneNotes: "Clair, direct, orienté bénéfice produit. Mise en avant de la valeur et de l'urgence.",
  },

  // ─── IMMOBILIER / INVESTISSEMENT ───
  immobilier: {
    vocabulary: [
      "rendement locatif", "cash-flow", "patrimoine",
      "investissement", "effet de levier", "LMNP", "SCI",
      "rentabilité", "fiscalité", "défiscalisation",
      "travaux", "colocation", "location courte durée",
    ],
    angles: [
      "Générer X€/mois de revenus passifs",
      "La stratégie pour acheter sans apport",
      "Ce que les banquiers ne te disent pas",
      "Le premier investissement qui change tout",
    ],
    painPoints: [
      "Avoir peur de se lancer avec un premier achat",
      "Ne pas comprendre la fiscalité",
      "Penser que l'immobilier est réservé aux riches",
      "Se faire arnaquer par un mauvais deal",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      formation: "saas_dashboard",
      coaching: "video_call",
      checklist: "checklist",
      challenge: "calendar",
    },
    toneNotes: "Sérieux mais accessible. Chiffres concrets. Crédibilité via l'expérience terrain. Pas de promesses irréalistes.",
  },

  // ─── TECH / SaaS / DÉVELOPPEMENT ───
  tech: {
    vocabulary: [
      "automatisation", "API", "intégration", "workflow",
      "no-code", "productivité", "stack", "dashboard",
      "analytics", "déploiement", "scalabilité", "onboarding",
    ],
    angles: [
      "Gagner X heures par semaine grâce à l'automatisation",
      "La stack complète pour [résultat]",
      "Zéro code requis — setup en 15 minutes",
      "ROI mesurable dès le premier mois",
    ],
    painPoints: [
      "Trop de tâches manuelles répétitives",
      "Des outils qui ne communiquent pas entre eux",
      "Manque de visibilité sur les KPIs",
      "Trop de temps en configuration, pas assez en action",
    ],
    visualDefaults: {
      saas: "saas_dashboard",
      ebook: "ebook_cover",
      formation: "saas_dashboard",
      template: "checklist",
      chatbot: "chat_interface",
    },
    toneNotes: "Précis et technique mais pas obscur. Démontrer la valeur concrète (temps gagné, argent économisé). Tonalité startup friendly.",
  },

  // ─── THÉRAPIE / ACCOMPAGNEMENT / SPIRITUALITÉ ───
  therapie: {
    vocabulary: [
      "apaisement", "libération", "cheminement intérieur",
      "ancrage", "conscience", "présence", "guérison",
      "respiration", "méditation", "lâcher-prise", "harmonie",
      "sérénité", "reconnexion", "écoute de soi",
    ],
    angles: [
      "Retrouver la paix intérieure en X séances",
      "Ce que la science dit sur [méthode]",
      "Le premier pas vers ta transformation intérieure",
      "Tu mérites de te sentir bien au quotidien",
    ],
    painPoints: [
      "Se sentir submergé par le stress ou l'anxiété",
      "Avoir tout essayé sans résultat durable",
      "Ne pas se sentir compris dans son mal-être",
      "Vivre en pilote automatique sans joie",
    ],
    visualDefaults: {
      ebook: "ebook_cover",
      coaching: "video_call",
      meditation: "calendar",
      programme: "calendar",
      challenge: "calendar",
    },
    toneNotes: "Doux, bienveillant mais pas mou. Vocabulaire sensoriel et émotionnel. Crédibilité via les résultats, pas les titres.",
  },

  // ─── ÉDUCATION / FORMATION / COURS ───
  education: {
    vocabulary: [
      "apprentissage", "compétences", "certification",
      "modules", "progression", "résultats", "maîtrise",
      "exercices pratiques", "cas concrets", "méthodologie",
      "expertise", "diplôme", "formation continue",
    ],
    angles: [
      "Maîtrise [compétence] en X semaines",
      "La méthode utilisée par les meilleurs [rôle]",
      "Certification reconnue incluse",
      "Accès à vie + communauté de pairs",
    ],
    painPoints: [
      "Consommer des tonnes de contenu sans progresser",
      "Formations trop théoriques, pas assez pratiques",
      "Ne pas savoir par où commencer",
      "Investir sans garantie de résultat",
    ],
    visualDefaults: {
      formation: "certificate",
      ebook: "ebook_cover",
      challenge: "calendar",
      coaching: "video_call",
      checklist: "checklist",
    },
    toneNotes: "Pédagogique et structuré. Inspirer confiance par la méthode. Résultats des anciens élèves comme preuve.",
  },
};

// Keywords → niche mapping for fuzzy matching
const NICHE_KEYWORDS: Array<[string[], string]> = [
  [["coach", "développement personnel", "life coach", "mindset", "accompagnement individuel"], "coaching"],
  [["marketing", "digital", "business en ligne", "webmarketing", "growth", "infopreneur", "solopreneur", "copywriting", "vente en ligne"], "marketing"],
  [["fitness", "sport", "santé", "bien-être", "yoga", "musculation", "nutrition", "perte de poids", "minceur", "remise en forme"], "fitness"],
  [["freelance", "indépendant", "prestataire", "consultant", "auto-entrepreneur", "micro-entreprise", "graphiste", "développeur"], "freelance"],
  [["ecommerce", "e-commerce", "shopify", "boutique en ligne", "produit", "dropshipping", "amazon", "marketplace"], "ecommerce"],
  [["immobilier", "investissement", "patrimoine", "locatif", "LMNP", "SCI", "location", "défiscalisation"], "immobilier"],
  [["tech", "saas", "logiciel", "application", "startup", "développeur", "no-code", "ia", "intelligence artificielle", "automatisation"], "tech"],
  [["thérapie", "thérapie", "spiritualité", "méditation", "psychologie", "naturopathie", "hypnose", "sophrologie", "énergétique", "holistique"], "therapie"],
  [["formation", "éducation", "cours", "enseignement", "e-learning", "certification", "tutoriel", "masterclass"], "education"],
];

function detectNicheKey(niche: string): string | null {
  if (!niche) return null;
  const lower = niche.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Direct key match
  if (NICHE_DB[lower]) return lower;

  // Keyword match
  for (const [keywords, key] of NICHE_KEYWORDS) {
    for (const kw of keywords) {
      const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(kwNorm) || kwNorm.includes(lower)) {
        return key;
      }
    }
  }

  return null;
}

/**
 * Build niche-specific prompt instructions for the AI.
 * Returns empty string if niche is unknown.
 */
export function buildNichePrompt(niche: string, offerType?: string): string {
  const key = detectNicheKey(niche);
  if (!key) return "";

  const rec = NICHE_DB[key];
  const lines: string[] = [];

  lines.push("═══ RECOMMANDATIONS SPÉCIFIQUES À LA NICHE ═══");
  lines.push("");
  lines.push(`NICHE DÉTECTÉE : ${niche.toUpperCase()}`);
  lines.push("");

  lines.push("VOCABULAIRE DE LA NICHE (utilise ces mots naturellement) :");
  lines.push(rec.vocabulary.map(v => `« ${v} »`).join(", "));
  lines.push("");

  lines.push("ANGLES DE COPYWRITING PROUVÉS DANS CETTE NICHE :");
  rec.angles.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");

  lines.push("POINTS DE DOULEUR À EXPLOITER (identifie-toi au prospect) :");
  rec.painPoints.forEach(p => lines.push(`- ${p}`));
  lines.push("");

  lines.push(`TON & STYLE RECOMMANDÉ : ${rec.toneNotes}`);
  lines.push("");

  // Suggest visual type based on offer type
  if (offerType) {
    const lowerOffer = offerType.toLowerCase();
    for (const [oKey, vType] of Object.entries(rec.visualDefaults)) {
      if (lowerOffer.includes(oKey)) {
        lines.push(`VISUEL HERO RECOMMANDÉ pour ce type d'offre : "${vType}"`);
        break;
      }
    }
  }

  lines.push("");
  lines.push("IMPORTANT : Ces recommandations sont un GUIDE, pas un script. Adapte-les au contexte spécifique de l'offre. Le copywriting doit rester UNIQUE et SPÉCIFIQUE, pas générique.");

  return lines.join("\n");
}

/**
 * Get the recommended hero_visual_type for a niche + offer type.
 * Returns null if no specific recommendation.
 */
export function getRecommendedVisualType(niche: string, offerType?: string): string | null {
  const key = detectNicheKey(niche);
  if (!key || !offerType) return null;

  const rec = NICHE_DB[key];
  const lower = offerType.toLowerCase();
  for (const [oKey, vType] of Object.entries(rec.visualDefaults)) {
    if (lower.includes(oKey)) return vType;
  }
  return null;
}
