// lib/nav/projectBack.ts
//
// Où mène la flèche "retour" des écrans d'un projet.
//
// DRAME GWENN (1er août 2026) : "Je clique sur les stats depuis Mes
// projets. La flèche des stats me ramène sur le quiz. La flèche du quiz
// me ramène sur les stats. Et je tourne en boucle entre les deux, sans
// pouvoir en sortir."
//
// Deux écrans se renvoyaient la balle :
//   - la page stats pointait EN DUR vers l'éditeur ;
//   - l'éditeur faisait `router.back()`, donc revenait aux stats.
// `router.back()` n'est pas une hiérarchie, c'est un historique : il
// renvoie là d'où on vient, y compris vers un écran qui renverra ici.
// Deux écrans qui se citent l'un l'autre = cycle, et l'utilisatrice est
// prisonnière (sa seule sortie était le bouton retour du navigateur,
// qui rejouait la même boucle).
//
// RÈGLE : la flèche retour suit une HIÉRARCHIE, jamais l'historique.
// Tous les écrans d'un projet (éditeur de quiz, éditeur de sondage,
// stats) sont des enfants de la liste des contenus. La navigation LATÉRALE
// (stats <-> éditeur) existe toujours, mais par des liens explicites et
// nommés, jamais par la flèche retour.
//
// Corollaire testé plus bas : remonter de parent en parent depuis
// n'importe quel écran finit TOUJOURS sur la liste, en un nombre fini
// d'étapes. Un futur écran qui pointerait vers un descendant ferait
// rougir le test avant la cliente.

/** Mes contenus : racine de tous les écrans d'un projet (côté
 *  Tiquiz, le jumeau, c'est /quizzes). */
export const PROJECT_LIST_PATH = "/contents";

/** Écrans qui portent une flèche retour dans l'espace projet. */
export type ProjectScreen = "quizEditor" | "surveyEditor" | "analytics";

/**
 * Parent hiérarchique d'un écran de projet. Volontairement sans
 * paramètre d'historique ni de referrer : la destination ne doit pas
 * dépendre du chemin parcouru, sinon elle redevient cyclable.
 */
export function projectBackHref(_screen: ProjectScreen): string {
  return PROJECT_LIST_PATH;
}
