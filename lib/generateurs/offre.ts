// lib/generateurs/offre.ts
//
// LA SEULE CHOSE QUE LA CRÉATRICE SAISIT.
//
// Le quiz porte déjà le sujet, le ton, les profils et leurs
// descriptions (`briefQuiz.ts`). Ce qu'il ne peut pas savoir, c'est ce
// qu'elle VEND : le bonus et la séquence d'emails mènent quelque part,
// et sans ce quelque part le modèle invente une offre qui n'existe pas.
//
// -- UNE SEULE OFFRE, ET C'EST UNE DÉCISION ---------------------------
//
// L'Atelier en accepte plusieurs, une par profil (retour Monique,
// 5 août 2026 : "je n'ai pas une offre à proposer mais 3"). On ne
// reprend PAS ça ici, pas encore : ça fait passer le formulaire de trois
// champs à un tableau à remplir profil par profil, et ça ajoute un
// contrôle de couverture (chaque profil doit avoir son offre, et une
// seule) qui refuse la génération tant qu'il manque une case.
//
// Pour une première version, un formulaire qu'on remplit en trente
// secondes vaut mieux qu'un formulaire complet qu'on abandonne. Le jour
// où une créatrice Tiquiz le demande, `analyzeOfferCoverage` existe déjà
// dans formaquiz et se porte tel quel.

/** Le format de l'offre payante. Liste fermée : elle sert au prompt. */
export const FORMATS_OFFRE = [
  "formation",
  "accompagnement",
  "prestation",
  "outil",
  "produit",
  "abonnement",
  "groupe",
] as const;
export type FormatOffre = (typeof FORMATS_OFFRE)[number];

/**
 * Comment on DÉCRIT ce format au modèle.
 *
 * Le code porte une clé courte (elle voyage dans une requête et se
 * traduit à l'écran) ; le prompt reçoit la phrase, en français, parce
 * que c'est lui qui la lit. Les deux ne se confondent pas : envoyer
 * `"groupe"` tel quel au modèle lui ferait écrire sur des groupes de
 * discussion.
 */
export const FORMAT_OFFRE_POUR_PROMPT: Record<FormatOffre, string> = {
  formation: "une formation en ligne, suivie en autonomie",
  accompagnement: "un accompagnement ou du coaching individuel",
  prestation: "une prestation de service réalisée par la créatrice",
  outil: "un outil ou un logiciel",
  produit: "un produit physique",
  abonnement: "un abonnement, facturé de façon récurrente",
  groupe: "un programme suivi en groupe, avec une promotion",
};

export interface Offre {
  /** Ce que l'offre promet, dans les mots de la créatrice. */
  promesse: string;
  format: FormatOffre;
  /** Son prix, tel qu'elle l'écrit. Facultatif. */
  prix: string;
}

/**
 * L'offre, écrite pour un prompt.
 *
 * Rend une chaîne VIDE quand il n'y a pas d'offre : le générateur de
 * promotion n'en demande pas, et une ligne "OFFRE : -" apprendrait au
 * modèle qu'il a le droit d'en inventer une (même règle que le brief).
 */
export function rendreOffrePourPrompt(offre: Offre | null | undefined): string {
  if (!offre || !offre.promesse.trim()) return "";
  const l = [
    `L'OFFRE PAYANTE VERS LAQUELLE ÇA MÈNE : ${offre.promesse.trim()}`,
    `FORMAT DE L'OFFRE : ${FORMAT_OFFRE_POUR_PROMPT[offre.format] ?? offre.format}`,
  ];
  if (offre.prix.trim()) l.push(`SON PRIX, À N'ÉCRIRE QUE TEL QUEL : ${offre.prix.trim()}`);
  return l.join("\n");
}
