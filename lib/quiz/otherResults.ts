// lib/quiz/otherResults.ts
//
// Où se place "Découvre les autres profils" sur la page de résultat.
//
// -- POURQUOI (retour Gwenn, 4 août 2026) -----------------------------
//
// "Sur la page de résultat, 'Découvre les autres profils' est placé au
// dessus du bouton d'achat. Ça offre une porte de sortie juste avant la
// proposition."
//
// Elle a raison, et c'est net : le visiteur vient de se reconnaître dans
// son profil, c'est le moment où il est le plus disponible pour ce qu'on
// lui propose. Lui tendre un accordéon avec trois autres profils à
// explorer juste avant le bouton, c'est lui donner quelque chose d'autre
// à faire au moment précis où il fallait qu'il clique.
//
// Le bloc reste utile, il ne disparaît pas : il satisfait une vraie
// curiosité ("j'ai eu quoi, et les autres ?") et il fait rester sur la
// page. Il passe simplement APRÈS.
//
// -- CE QUI CHANGE POUR LES QUIZ EXISTANTS ----------------------------
//
// Tout le monde, y compris les quiz déjà en ligne. C'est la demande
// explicite de Béné ("oui ça peut affecter tous les quiz, c'est très
// bien"), et c'est cohérent : le placement d'avant était une erreur, pas
// un choix. La créatrice qui veut l'ancien comportement le remet en un
// clic, et celle qui ne veut plus du bloc du tout peut le retirer (le
// cas de Gwenn sur ses campagnes payantes : "ça dilue l'attention").

/** Où le bloc se place par rapport au bouton d'appel à l'action. */
export type OtherResultsPlacement =
  /** Après le bouton. Le défaut, depuis le 4 août 2026. */
  | "after_cta"
  /** Avant le bouton. L'ancien comportement, pour qui le préfère. */
  | "before_cta"
  /** Pas affiché du tout. */
  | "hidden";

const PLACEMENTS = new Set(["after_cta", "before_cta"]);

/**
 * Décide, et personne d'autre.
 *
 * Deux réglages se combinent, et c'est exactement le genre de
 * combinaison qu'on a déjà relue à trois endroits différents du viewer
 * (le score, les réseaux de partage, l'alignement). Elle vit donc ici,
 * et le viewer comme l'aperçu de l'éditeur appellent la même fonction.
 *
 * Fail-safe dans les deux sens :
 * - `show` à false gagne toujours : décocher doit retirer le bloc, quel
 *   que soit le reste ;
 * - une position absente, nulle ou illisible donne `after_cta`, donc le
 *   nouveau défaut s'applique même si la migration n'est pas encore
 *   passée en production.
 */
export function resolveOtherResultsPlacement(
  show: boolean | null | undefined,
  position: string | null | undefined,
): OtherResultsPlacement {
  if (show !== true) return "hidden";
  const p = String(position ?? "").trim();
  return PLACEMENTS.has(p) ? (p as OtherResultsPlacement) : "after_cta";
}

/** Le bloc se rend-il à cet endroit de la page ? */
export function showsOtherResultsAt(
  placement: OtherResultsPlacement,
  slot: "before_cta" | "after_cta",
): boolean {
  return placement === slot;
}
