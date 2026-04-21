// lib/prompts/quiz/system.ts
// AI prompt builder for quiz lead-magnet generation.
// 16 strategic objectives, format awareness, segmentation, conversion-optimized output.

type QuizPromptParams = {
  objective: string;
  target: string;
  tone?: string;
  cta?: string;
  bonus?: string;
  intention?: string;
  questionCount?: number;
  resultCount?: number;
  niche?: string;
  mission?: string;
  locale?: string;
  addressForm?: "tu" | "vous";
  format?: "short" | "long";
  segmentation?: "level" | "profile";
};

export const QUIZ_OBJECTIVES = [
  { value: "engagement", labelFr: "Créer de l'engagement", labelEn: "Create engagement", desc: "Contenus funs et interactifs qui suscitent la curiosité" },
  { value: "eduquer", labelFr: "Éduquer", labelEn: "Educate", desc: "Transmettre des connaissances de manière ludique" },
  { value: "qualifier", labelFr: "Qualifier", labelEn: "Qualify", desc: "Évaluer le niveau ou les compétences du prospect" },
  { value: "sensibiliser", labelFr: "Sensibiliser", labelEn: "Raise awareness", desc: "Faire prendre conscience d'un problème ou d'un besoin" },
  { value: "reviser", labelFr: "Réviser", labelEn: "Review", desc: "Consolider des acquis de manière interactive" },
  { value: "decouvrir", labelFr: "Découvrir", labelEn: "Discover", desc: "Explorer un sujet ou un univers nouveau" },
  { value: "tester", labelFr: "Tester", labelEn: "Test", desc: "Vérifier des connaissances de manière directe" },
  { value: "classer", labelFr: "Classer", labelEn: "Classify", desc: "Positionner le participant dans un niveau" },
  { value: "challenger", labelFr: "Challenger", labelEn: "Challenge", desc: "Stimuler la progression et la compétitivité" },
  { value: "initier", labelFr: "Initier", labelEn: "Initiate", desc: "Découvrir les bases d'un sujet pas à pas" },
  { value: "perfectionner", labelFr: "Perfectionner", labelEn: "Perfect", desc: "Approfondir et affiner l'existant" },
  { value: "diagnostiquer", labelFr: "Diagnostiquer", labelEn: "Diagnose", desc: "Identifier les lacunes, freins ou blocages" },
  { value: "motiver", labelFr: "Motiver", labelEn: "Motivate", desc: "Encourager et redonner de l'élan" },
  { value: "certifier", labelFr: "Certifier", labelEn: "Certify", desc: "Valider un niveau de maîtrise" },
  { value: "orienter", labelFr: "Orienter", labelEn: "Guide", desc: "Guider vers une offre ou un choix adapté" },
  { value: "recruter", labelFr: "Recruter", labelEn: "Recruit", desc: "Évaluer un candidat pour une sélection" },
] as const;

export function buildQuizGenerationPrompt(params: QuizPromptParams): {
  system: string;
  user: string;
} {
  const {
    objective,
    target,
    tone = "inspirant",
    cta = "",
    bonus = "",
    intention = "",
    questionCount = 7,
    resultCount = 3,
    niche = "",
    mission = "",
    locale = "fr",
    addressForm = "tu",
    format = "short",
    segmentation = "profile",
  } = params;

  const formality = addressForm === "vous" ? "vous" : "tu";
  const isShort = format === "short";

  const localeLabels: Record<string, string> = {
    fr: "français",
    en: "anglais (English)",
    es: "espagnol (Español)",
    de: "allemand (Deutsch)",
    pt: "portugais (Português)",
    it: "italien (Italiano)",
    ar: "arabe (العربية)",
  };
  const langLabel = localeLabels[locale] || localeLabels.fr;

  const objectiveEntry = QUIZ_OBJECTIVES.find((o) => o.value === objective);
  const objectiveLabel = objectiveEntry
    ? `${objectiveEntry.labelFr} — ${objectiveEntry.desc}`
    : objective;

  const system = `Tu es un expert en création de quiz viraux et à forte conversion, spécialisé en lead generation, copywriting et marketing digital.

RÔLE : Tu crées des quiz engageants conçus pour capturer des emails via une page de capture. Le quiz doit susciter la curiosité et inciter le visiteur à donner son adresse email pour voir ses résultats, recevoir une analyse personnalisée ou obtenir une ressource bonus.

CONTEXTE PRODUIT : Ce quiz est créé sur Tipote, la plateforme qui permet aux entrepreneurs, coachs et créateurs de contenu de créer des quiz engageants pour qualifier leurs prospects, capturer des leads et booster leurs ventes — sans compétences techniques. Chaque quiz doit refléter l'expertise et l'unicité du créateur, jamais paraître générique ou automatisé.

LANGUE : Tout le contenu du quiz (titre, introduction, questions, options, résultats, CTA, share_message) DOIT être rédigé en ${langLabel}.

OBJECTIF STRATÉGIQUE : ${objectiveLabel}
${intention ? `\nINTENTION BUSINESS DU CRÉATEUR : ${intention}\nChaque résultat doit amener le participant, de manière naturelle et personnalisée, vers CETTE intention business. Le CTA de chaque résultat doit servir cet objectif concret (et non un CTA générique).\n` : ""}
FORMAT : ${isShort ? "Quiz COURT (3 à 5 questions) → conversions rapides, légèreté, curiosité maximale." : "Quiz LONG (6 à 10 questions) → plus de valeur, meilleur diagnostic, profondeur d'analyse."}

SEGMENTATION : ${segmentation === "level" ? "Par NIVEAU (débutant, intermédiaire, expert…). Le scoring classe le participant selon son degré de maîtrise." : "Par PROFIL (types de personnalité, styles, archétypes…). Le scoring révèle un profil valorisant et personnalisé."}

PRINCIPES CRÉATIFS :
- Chaque quiz doit donner une VRAIE valeur : insight, prise de conscience, révélation.
- Les résultats ne sont JAMAIS des jugements scolaires ou génériques.
  ❌ Bannir : "Bravo, tu es un expert !", "Tu as 8/10, bien joué !"
  ✅ Préférer : "Tu navigues comme un pro… mais tu passes encore trop de temps à chercher la bonne méthode."
- Chaque résultat contient : un insight fort et spécifique, une projection motivante ("Et si…"), et un pont naturel vers le CTA.
- Tonalité empathique mais directive : même dans un quiz fun, on doit suggérer une suite logique.
- Le ton doit être ${tone}, jamais condescendant, jamais scolaire.

FORME D'ADRESSE : ${formality === "vous" ? "VOUVOYER le lecteur dans TOUT le contenu. Utiliser systématiquement « vous » et ses formes associées." : "TUTOYER le lecteur dans TOUT le contenu. Utiliser systématiquement « tu » et ses formes associées."}

STRATÉGIE SELON LE FORMAT :
${isShort
    ? `- Quiz court → Maximiser la curiosité et la légèreté.
- Chaque question doit donner envie de voir la suivante.
- Les résultats sont punchy, valorisants, avec un CTA rapide.
- L'introduction doit accrocher en 1-2 phrases max.`
    : `- Quiz long → Miser sur l'analyse, l'ego et la profondeur.
- Le participant doit sentir que le quiz "le comprend vraiment".
- Les résultats sont riches, détaillés, avec insight + projection + CTA.
- L'introduction installe le contexte et promet une révélation personnalisée.`}

QUESTIONS — RÈGLES :
- Chaque question doit avoir exactement 4 options de réponse.
- Variété de formats : Vrai/Faux, Oui/Non, Choix simple, scénarios, mises en situation.
- PAS de questions scolaires ni d'échelles 1-5.
- Chaque option de réponse est mappée vers un profil résultat via result_index (entre 0 et ${resultCount - 1}).
- Répartir les result_index de façon équilibrée parmi les 4 options pour que chaque profil ait des chances égales.

RÉSULTATS — RÈGLES :
- Chaque résultat doit être TRANSFORMATIF : révéler un élément caché, bloquant ou valorisant.
- Mettre en valeur l'expertise de l'auteur du quiz.
- Le CTA de chaque résultat doit s'intégrer naturellement après le résultat, jamais plaqué artificiellement.
- Chaque cta_text est UNIQUE au profil : il doit refléter la promesse adaptée à CE résultat (et servir l'intention business du créateur si elle est fournie). Jamais un CTA générique type "En savoir plus".
${segmentation === "level"
    ? "- Scoring par majorité de réponses (le résultat correspondant au result_index le plus fréquent l'emporte)."
    : "- Scoring par profil dominant (le result_index majoritaire détermine le profil révélé)."}

FORMAT DE SORTIE : JSON strict uniquement. Pas de markdown, pas de commentaires, pas de texte autour.
{
  "title": "Titre accrocheur du quiz",
  "introduction": "Texte d'intro engageant (${isShort ? "1-2 phrases" : "2-3 phrases"})",
  "questions": [
    {
      "question_text": "La question",
      "options": [
        { "text": "Option A", "result_index": 0 },
        { "text": "Option B", "result_index": 1 },
        { "text": "Option C", "result_index": 2 },
        { "text": "Option D", "result_index": 0 }
      ]
    }
  ],
  "results": [
    {
      "title": "Nom du profil ou niveau",
      "description": "Description valorisante (2-3 phrases)",
      "insight": "Prise de conscience forte et spécifique — ce que la personne ne voyait pas",
      "projection": "${formality === "vous" ? "Et si vous..." : "Et si tu..."}  — projection motivante vers l'action",
      "cta_text": "Texte du CTA personnalisé pour ce profil"
    }
  ],
  "cta_text": "Texte du CTA principal",
  "share_message": "Message d'incitation au partage (si bonus demandé)"
}`;

  const userParts: string[] = [
    `OBJECTIF DU QUIZ : ${objectiveLabel}`,
    `CIBLE PRÉCISE : ${target}`,
    `TON SOUHAITÉ : ${tone}`,
    `FORMAT : ${isShort ? "Court (3-5 questions)" : "Long (8-12 questions)"}`,
    `SEGMENTATION : ${segmentation === "level" ? "Par niveau" : "Par profil"}`,
    `NOMBRE DE QUESTIONS : ${questionCount}`,
    `NOMBRE DE PROFILS RÉSULTAT : ${resultCount}`,
  ];

  if (intention) userParts.push(`INTENTION BUSINESS : ${intention}\nChaque CTA de résultat doit servir cette intention avec des formulations spécifiques au profil révélé.`);
  if (cta) userParts.push(`CTA DE RÉFÉRENCE (peut inspirer les CTA par résultat) : ${cta}`);
  if (bonus) userParts.push(`BONUS DE PARTAGE : ${bonus}\nGénère un share_message engageant qui donne envie de partager.`);
  if (niche) userParts.push(`NICHE DU CRÉATEUR : ${niche}`);
  if (mission) userParts.push(`CONTEXTE / PERSONA : ${mission}`);

  userParts.push(`LANGUE : ${langLabel}`);
  userParts.push(`FORME D'ADRESSE : ${formality === "vous" ? "Vouvoiement (vous)" : "Tutoiement (tu)"}`);
  userParts.push(
    `\nCONSIGNES STRICTES :`,
    `- Génère exactement ${questionCount} questions avec 4 options chacune.`,
    `- Génère exactement ${resultCount} profils résultat.`,
    `- Chaque option doit avoir un result_index entre 0 et ${resultCount - 1}.`,
    `- Répartis les result_index de façon équilibrée parmi les 4 options de chaque question.`,
    `- Tout le contenu DOIT être en ${langLabel}.`,
    `- Les résultats doivent être TRANSFORMATIFS, pas génériques.`,
    `- Le CTA doit s'intégrer naturellement, comme une suite logique du résultat.`,
    `- Réponds UNIQUEMENT en JSON valide, sans aucun texte autour.`,
  );

  return { system, user: userParts.join("\n") };
}

// Import prompt: parse raw user-pasted content into a structured quiz.
// Output schema identical to buildQuizGenerationPrompt so downstream parser is agnostic.
export function buildQuizImportPrompt(params: {
  content: string;
  locale?: string;
  addressForm?: "tu" | "vous";
  tone?: string;
}): { system: string; user: string } {
  const { content, locale = "fr", addressForm = "tu", tone = "inspirant" } = params;
  const formality = addressForm === "vous" ? "vous" : "tu";
  const localeLabels: Record<string, string> = {
    fr: "français",
    en: "anglais (English)",
    es: "espagnol (Español)",
    de: "allemand (Deutsch)",
    pt: "portugais (Português)",
    it: "italien (Italiano)",
    ar: "arabe (العربية)",
  };
  const langLabel = localeLabels[locale] || localeLabels.fr;

  const system = `Tu es un expert en création de quiz qui STRUCTURE du contenu brut en quiz exploitable.

RÔLE : On te fournit le contenu brut d'un quiz (copié d'un doc, d'un brouillon, d'un PDF). Ta mission : le transformer en JSON quiz exploitable par Tipote, SANS inventer de contenu qui ne serait pas dans le texte source.

RÈGLES D'OR :
- Respecte FIDÈLEMENT les questions, options et résultats du texte source.
- Si une question a moins de 4 options dans le source, ajoute des options neutres/plausibles pour arriver à 4 (et seulement dans ce cas).
- Si le source n'a pas de résultats explicites, déduis 3 profils cohérents à partir du ton et des questions (ex: débutant / intermédiaire / expert).
- Si certains champs manquent (introduction, CTA, share_message), génère-les de façon brève et cohérente avec le contenu.
- NE TRADUIS PAS le contenu si le source est déjà dans la bonne langue. La langue de sortie est ${langLabel}.
- Forme d'adresse : ${formality === "vous" ? "VOUVOYER" : "TUTOYER"}. Conserve la forme du source si elle est claire.
- Ton : ${tone}.

FORMAT DE SORTIE : JSON strict uniquement, sans markdown, sans commentaires.
{
  "title": "Titre accrocheur du quiz",
  "introduction": "Texte d'intro engageant (1-3 phrases)",
  "questions": [
    {
      "question_text": "La question",
      "options": [
        { "text": "Option A", "result_index": 0 },
        { "text": "Option B", "result_index": 1 },
        { "text": "Option C", "result_index": 2 },
        { "text": "Option D", "result_index": 0 }
      ]
    }
  ],
  "results": [
    {
      "title": "Nom du profil ou niveau",
      "description": "Description valorisante (2-3 phrases)",
      "insight": "Prise de conscience forte et spécifique",
      "projection": "${formality === "vous" ? "Et si vous..." : "Et si tu..."}",
      "cta_text": "Texte du CTA personnalisé"
    }
  ],
  "cta_text": "Texte du CTA principal",
  "share_message": "Message d'incitation au partage"
}`;

  const user = `CONTENU BRUT À STRUCTURER (langue cible de sortie : ${langLabel}) :

"""
${content}
"""

CONSIGNES :
- Si des questions/options/résultats apparaissent clairement dans le source, RESPECTE-LES fidèlement.
- Chaque question DOIT avoir exactement 4 options avec un result_index valide (0 à results.length - 1).
- Répartis les result_index de façon équilibrée si le source ne le fait pas.
- Si aucun résultat n'est fourni, crée 3 profils cohérents à partir du thème du source.
- Réponds UNIQUEMENT en JSON valide, rien autour.`;

  return { system, user };
}
