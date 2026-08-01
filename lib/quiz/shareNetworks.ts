// lib/quiz/shareNetworks.ts
//
// Quels boutons de partage le visiteur voit, et dans quel ordre.
//
// La règle était réécrite à la main à chaque écran du viewer, avec une
// liste de repli codée en dur qui ne contenait que 5 réseaux sur 9 :
//
//   const allowed = (quiz.share_networks && quiz.share_networks.length > 0)
//     ? quiz.share_networks
//     : ["x", "facebook", "linkedin", "whatsapp", "threads"];
//
// Conséquence : une créatrice qui ne cochait AUCUN réseau (le cas par
// défaut) privait ses visiteurs d'Instagram, Pinterest, Reddit et email
// sans l'avoir demandé, et sans que rien ne le dise nulle part.
//
// Règle (Béné, 1er août 2026) : les réseaux cochés, et TOUS les réseaux
// si elle n'en coche aucun. Une seule fonction, testée, appelée par tous
// les écrans qui affichent des boutons de partage.

import { ALLOWED_SHARE_NETWORKS, sanitizeShareNetworks, type ShareNetwork } from "../quizBranding.ts";

/**
 * Réseaux à proposer au visiteur.
 *
 * - une sélection non vide -> exactement celle-ci, dans SON ordre
 *   (l'ordre de la créatrice est un choix, pas un hasard) ;
 * - rien de coché, colonne nulle, valeur illisible -> tous les réseaux.
 *
 * Les entrées inconnues sont écartées (`sanitizeShareNetworks`) : un
 * réseau retiré du produit ne doit pas laisser un bouton mort à l'écran.
 * Si la sélection ne contenait QUE des entrées inconnues, on retombe sur
 * tous les réseaux plutôt que sur un écran sans aucun bouton.
 */
export function resolveShareNetworks(selected: unknown): ShareNetwork[] {
  const clean = sanitizeShareNetworks(selected);
  return clean.length > 0 ? clean : [...ALLOWED_SHARE_NETWORKS];
}
