// lib/quiz/questionLayout.ts
//
// Deux réglages de présentation par question : son ALIGNEMENT et la
// DISPOSITION de ses réponses. Chacun peut suivre le quiz, ou faire
// exception.
//
// -- POURQUOI (retour Béné, 4 août 2026) -------------------------------
//
// "Mieux expliquer si centré, aligné à gauche, etc. Là c'est brouillon,
// tu empiles les trucs, ça devient n'importe quoi l'éditeur. Et il faut
// laisser le choix de TOUT aligner / centrer OU de modifier : par exemple
// une question où les réponses sont centrées, mais la suivante alignée à
// gauche, ou même une question en colonnes et une en liste."
//
// Le "tu empiles" est le vrai diagnostic. Il n'y avait qu'un seul étage
// assumé (le réglage du quiz) et un étage clandestin : l'alignement
// écrit DANS le texte riche, qui gagne pour toujours dès qu'on a cliqué
// une fois sur un bouton d'alignement. Jocelyne s'est retrouvée avec un
// quiz "centré" dont elle réalignait les champs un par un, sans jamais
// pouvoir revenir en arrière autrement qu'en les reprenant tous.
//
// Il manquait l'étage du milieu : LA QUESTION. C'est celui qu'on ajoute
// ici, et c'est celui que réclament Tally et Typeform (un réglage global,
// et une exception là où on en a besoin).
//
// -- LES TROIS ÉTAGES, DU PLUS FORT AU PLUS FAIBLE ---------------------
//
//   1. le champ    : l'alignement posé à la main dans le texte riche ;
//   2. la question : `config.align` (nouveau, `"inherit"` par défaut) ;
//   3. le quiz     : `question_layout` ("centered" | "left" | "split").
//
// Un étage ne s'applique que si aucun étage plus fort ne s'est prononcé.
// `"inherit"` n'est donc PAS une valeur d'affichage : c'est "je ne me
// prononce pas", et c'est le défaut de tout ce qui existe déjà. Aucun
// quiz en ligne ne bouge tant que la créatrice n'a rien touché.
//
// -- CE QUI REND LE RÉGLAGE RÉVERSIBLE ---------------------------------
//
// Poser une exception est facile, la retirer doit l'être autant. D'où
// `clearRichTextAlign()` : le bouton "tout réaligner" de l'éditeur retire
// les alignements écrits dans les champs, donc l'étage 1 se tait et le
// réglage du quiz reprend la main partout. Sans lui, "tout centrer" ne
// pourrait rien centrer du tout sur un quiz déjà bricolé, ce qui est
// exactement ce que Jocelyne a vécu.

import type { BlockAlign } from "@/lib/quiz/textAlign";

/** Réglage de présentation d'une question. `"inherit"` = suit le quiz. */
export type QuestionAlignSetting = "inherit" | "center" | "left";

/** Disposition des réponses d'une question. `"inherit"` = suit le quiz. */
export type QuestionAnswerLayoutSetting = "inherit" | "list" | "grid";

/**
 * Lit `config.align` sans jamais faire confiance à ce qu'il y a en base :
 * une valeur inconnue, absente ou illisible vaut `"inherit"`, donc le
 * comportement d'avant.
 */
export function questionAlignSetting(raw: unknown): QuestionAlignSetting {
  return raw === "center" || raw === "left" ? raw : "inherit";
}

/** Idem pour la disposition des réponses. */
export function questionAnswerLayoutSetting(raw: unknown): QuestionAnswerLayoutSetting {
  return raw === "list" || raw === "grid" ? raw : "inherit";
}

/**
 * L'alignement EFFECTIF d'une question : son réglage propre, sinon celui
 * du quiz.
 *
 * @param setting    `config.align` de la question
 * @param quizLayout `quizzes.question_layout`
 *
 * La disposition "split" (image sur un côté) n'est pas un alignement :
 * elle cale son texte à gauche, comme avant.
 */
export function resolveQuestionAlign(
  setting: unknown,
  quizLayout: string | null | undefined,
): BlockAlign {
  const own = questionAlignSetting(setting);
  if (own === "center") return "center";
  if (own === "left") return "left";
  return quizLayout === "centered" ? "center" : "left";
}

/**
 * La disposition EFFECTIVE des réponses d'une question, exprimée dans le
 * vocabulaire de `resolveAnswerLayout` ("auto" | "list" | "grid").
 *
 * On rend `undefined` quand la question ne se prononce pas : c'est ce que
 * `resolveAnswerLayout(quizLayout, override)` attend pour retomber sur le
 * réglage du quiz.
 */
export function resolveQuestionAnswerLayout(setting: unknown): "list" | "grid" | undefined {
  const own = questionAnswerLayoutSetting(setting);
  return own === "inherit" ? undefined : own;
}

/**
 * Retire l'alignement écrit À LA MAIN dans un champ de texte riche.
 *
 * C'est ce qui rend "tout réaligner" capable de faire ce qu'il promet :
 * tant qu'un champ porte son propre `text-align`, il gagne contre le
 * réglage du quiz, pour toujours.
 *
 * On enlève UNIQUEMENT l'alignement : le gras, la couleur, la taille et
 * le reste des styles en ligne sont conservés. Un attribut `align` HTML
 * (que certains navigateurs posent encore) est retiré aussi.
 */
export function clearRichTextAlign(html: string | null | undefined): string {
  if (typeof html !== "string" || !html) return html ?? "";
  return (
    html
      // style="...; text-align: center; ..." -> on retire la seule déclaration
      .replace(/text-align\s*:\s*[^;"']*;?/gi, "")
      // style="" devenu vide : on retire l'attribut, sinon le DOM se
      // remplit de résidus à chaque passage.
      .replace(/\s*style\s*=\s*"\s*"/gi, "")
      .replace(/\s*style\s*=\s*'\s*'/gi, "")
      // <div align="center">, hérité de vieux contenus collés.
      .replace(/\s*align\s*=\s*"(?:left|center|right|justify)"/gi, "")
      .replace(/\s*align\s*=\s*'(?:left|center|right|justify)'/gi, "")
      // Classes utilitaires posées par l'éditeur.
      .replace(/\s*\btext-(?:left|center|right)\b/gi, "")
      .replace(/\s*class\s*=\s*"\s*"/gi, "")
      .replace(/\s*class\s*=\s*'\s*'/gi, "")
  );
}
