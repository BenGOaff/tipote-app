// lib/generateurs/avancement.ts
//
// OÙ EN EST CE QU'ON A DEMANDÉ, EN UN COUP D'OEIL.
//
// Porté du labo de l'Atelier (`lib/bonus/project.ts`, `projectProgress`),
// qui l'affiche sous le titre de l'écran des dossiers depuis le 6 août.
// Sans lui, la grille de dossiers ne dit pas s'il reste du travail : il
// faut ouvrir les trois pour le savoir.
//
// -- CE MODULE NE REND AUCUNE PHRASE ----------------------------------
//
// Il rend un ÉTAT et deux nombres. L'interface existe en 7 langues, et
// c'est l'écran qui écrit. C'est la seule différence avec l'Atelier, qui
// n'existe qu'en français et rend donc la phrase directement.

/** Ce que la grille de dossiers annonce sous son titre. */
export type Avancement =
  | { etat: "rien"; faits: 0; total: number }
  | { etat: "partiel"; faits: number; total: number }
  | { etat: "complet"; faits: number; total: number };

/**
 * Combien de morceaux sont écrits, sur combien.
 *
 * Un morceau ne compte que s'il porte VRAIMENT du texte : une chaîne
 * vide revenue d'une génération ratée annoncerait un travail fait qui ne
 * l'est pas, et c'est le pire des trois cas (on ne le rouvre jamais).
 */
export function avancement(
  cles: readonly string[],
  ecrits: Record<string, { markdown?: string } | undefined>,
): Avancement {
  const total = cles.length;
  const faits = cles.filter((c) => String(ecrits[c]?.markdown ?? "").trim().length > 0).length;
  if (faits === 0) return { etat: "rien", faits: 0, total };
  if (faits >= total) return { etat: "complet", faits, total };
  return { etat: "partiel", faits, total };
}
