// lib/prompts/quiz/system.ts
// AI prompt builder for quiz lead magnet generation

type QuizPromptParams = {
  objective: string;
  target: string;
  tone?: string;
  cta?: string;
  bonus?: string;
  questionCount?: number;
  resultCount?: number;
  niche?: string;
  mission?: string;
  locale?: string;
};

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
    questionCount = 7,
    resultCount = 3,
    niche = "",
    mission = "",
  } = params;

  const system = `Tu es un expert en marketing digital, copywriting et lead generation.
Tu crées des quiz viraux à forte conversion pour capturer des emails.

PRINCIPES :
- Chaque quiz doit donner une VRAIE valeur (insight, prise de conscience).
- Les résultats ne sont PAS des jugements mais des profils valorisants et honnêtes.
- Chaque résultat contient un insight fort, une projection motivante, et un pont naturel vers le CTA.
- Le quiz doit être engageant, rapide (2-3 min), avec des questions simples et des options claires.
- Le ton doit être ${tone}, jamais condescendant.
- Les questions doivent être variées (pas juste des échelles 1-5).
- Chaque option de réponse est mappée vers un profil résultat (result_index).

FORMAT DE SORTIE : JSON strict, pas de markdown, pas de commentaires.
{
  "title": "Titre accrocheur du quiz (avec emoji optionnel)",
  "introduction": "Texte d'intro engageant (2-3 phrases max)",
  "questions": [
    {
      "question_text": "La question",
      "options": [
        { "text": "Option A", "result_index": 0 },
        { "text": "Option B", "result_index": 1 },
        { "text": "Option C", "result_index": 2 }
      ]
    }
  ],
  "results": [
    {
      "title": "Nom du profil",
      "description": "Description valorisante du profil (2-3 phrases)",
      "insight": "Prise de conscience forte et spécifique",
      "projection": "Si tu continues comme ça... / Si tu passes à l'action...",
      "cta_text": "Texte du CTA personnalisé pour ce profil"
    }
  ],
  "cta_text": "Texte du CTA principal",
  "share_message": "Message d'incitation au partage (si bonus demandé)"
}`;

  const userParts: string[] = [
    `OBJECTIF DU QUIZ : ${objective}`,
    `CIBLE : ${target}`,
    `TON : ${tone}`,
    `NOMBRE DE QUESTIONS : ${questionCount}`,
    `NOMBRE DE PROFILS RÉSULTAT : ${resultCount}`,
  ];

  if (cta) userParts.push(`CTA FINAL SOUHAITÉ : ${cta}`);
  if (bonus) userParts.push(`BONUS DE PARTAGE : ${bonus}\nGénère aussi un share_message engageant.`);
  if (niche) userParts.push(`NICHE DU CRÉATEUR : ${niche}`);
  if (mission) userParts.push(`PERSONA CIBLE (contexte) : ${mission}`);

  userParts.push(
    `\nIMPORTANT :`,
    `- Génère exactement ${questionCount} questions avec ${resultCount} options chacune (une par profil).`,
    `- Génère exactement ${resultCount} profils résultat.`,
    `- Chaque option doit avoir un result_index entre 0 et ${resultCount - 1}.`,
    `- Répartis les result_index de façon équilibrée dans les questions.`,
    `- Réponds UNIQUEMENT en JSON valide.`,
  );

  return { system, user: userParts.join("\n") };
}
