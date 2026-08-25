// lib/quiz/firstNameAsk.ts
//
// OÙ LE PRÉNOM EST DEMANDÉ, ET UNE SEULE FOIS (Béné, 25 août 2026).
//
// "Demander le prénom : on l'a au début + ensuite ? C'est flou, pas
// précis, pourquoi ? Si activé au début bah ça reste activé c'est tout."
//
// Elle a raison, et le flou venait de DEUX réglages qui portent le même
// mot dans deux sections différentes de l'éditeur :
//
//   - `ask_first_name`    : l'écran de personnalisation, AVANT la 1re
//     question. Il existe pour alimenter la variable {name} des textes.
//   - `capture_first_name`: le champ Prénom du formulaire de capture,
//     APRÈS le quiz, à côté de l'email.
//
// Les deux écrivent la MÊME valeur (le viewer n'a qu'un `firstName`).
// Quand les deux sont cochés, le visiteur donne son prénom au début,
// puis retrouve une case pré-remplie juste avant son email. Ce n'est pas
// une perte de donnée, c'est un champ de plus à franchir à l'endroit
// exact où on le perd.
//
// RÈGLE : le prénom se demande à UN moment. S'il est demandé au début,
// le formulaire de capture ne le redemande pas.
//
// Aucune migration : les deux colonnes restent, et un quiz qui n'avait
// que la capture est rendu exactement comme avant.
//
// La décision vit ici parce qu'elle est relue à TROIS endroits : le
// viewer public, l'aperçu du formulaire dans l'éditeur, et les contrôles
// de l'éditeur. Un aperçu qui recalcule une décision au lieu d'appeler
// la fonction du viewer finit toujours par mentir : c'est arrivé sept
// fois dans ce module.

export type FirstNameSource = {
  /** Écran de personnalisation avant la 1re question. */
  ask_first_name?: boolean | null;
  /** Champ Prénom du formulaire de capture. */
  capture_first_name?: boolean | null;
};

/** À quel moment le visiteur donne son prénom. */
export type FirstNameMoment = "intro" | "capture" | "jamais";

export function firstNameMoment(quiz: FirstNameSource): FirstNameMoment {
  if (quiz.ask_first_name === true) return "intro";
  if (quiz.capture_first_name === true) return "capture";
  return "jamais";
}

/**
 * Le formulaire de capture affiche-t-il le champ Prénom ?
 *
 * `dejaDonne` est un PARAMÈTRE OBLIGATOIRE, et c'est le garde-fou : si
 * le prénom devait être donné au début et qu'il est vide malgré tout
 * (arrivée par une URL bricolée, brouillon restauré incomplet), on le
 * redemande ici plutôt que de le perdre. Mieux vaut un champ de trop
 * qu'un lead sans prénom que la créatrice croyait collecter.
 */
export function showFirstNameOnCapture(
  quiz: FirstNameSource,
  dejaDonne: boolean,
): boolean {
  const moment = firstNameMoment(quiz);
  if (moment === "jamais") return false;
  if (moment === "intro" && dejaDonne) return false;
  return true;
}

/**
 * Le champ Prénom du formulaire de capture est-il obligatoire ?
 *
 * Quand il n'est là qu'en rattrapage (prénom attendu au début et
 * manquant), on ne bloque PAS l'envoi : le visiteur a répondu à tout le
 * quiz, lui refuser son résultat pour un champ qu'il n'a jamais vu
 * s'afficher serait le perdre à la dernière seconde.
 */
export function firstNameRequiredOnCapture(
  quiz: FirstNameSource,
  required: boolean | null | undefined,
): boolean {
  return firstNameMoment(quiz) === "capture" && required === true;
}
