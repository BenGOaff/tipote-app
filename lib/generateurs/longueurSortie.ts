// lib/generateurs/longueurSortie.ts
//
// COMBIEN CHAQUE MORCEAU DOIT FAIRE, ET LE PLAFOND QUI VA AVEC.
//
// Béné, 4 septembre 2026 : "comment on peut régler le problème des
// tokens en sortie sans perdre en qualité ? Je préfère payer plutôt que
// de générer de la merde, mais je veux économiser tout ce qui est
// possible de l'être. Attention à ne jamais rien tronquer, il faut
// contrôler mais sans jamais délivrer un demi contenu."
//
// -- CE QUI COÛTE, ET CE QUI NE COÛTE PAS -----------------------------
//
// La sortie coûte CINQ fois l'entrée au jeton, donc 73 à 79 % de la
// facture (mesuré le 4 septembre). Tout le travail sur le cache
// n'optimisait que la moitié pas chère.
//
// Et le plafond `max_tokens` ne coûte RIEN : on paie ce qui est écrit,
// pas ce qui était permis. Le seul levier qui pèse est donc la longueur
// DEMANDÉE, et c'est aussi le seul qui empêche une troncature.
//
// -- POURQUOI ON NE PEUT PAS SIMPLEMENT MONTER LE PLAFOND -------------
//
// C'est le réflexe, et il est faux. Mesuré en production côté Atelier
// (`app/api/me/bonus/route.ts`, commentaire du 5 août) : au delà de
// ~4500 jetons de sortie, la génération dépasse régulièrement les
// 85 secondes du budget et se fait couper, ce qui rend ZÉRO ligne.
//
// Un plafond trop haut échange donc une troncature contre une page
// vide. On ne monte pas le plafond : on demande une longueur qui tient
// LARGEMENT dessous, et le plafond redevient ce qu'il doit être, un
// filet contre l'emballement.
//
// -- ET LA LONGUEUR N'EST PAS UN BUDGET, C'EST UNE PROMESSE -----------
//
// Le socle promet déjà, dans les 4 piliers d'un bonus qui convertit :
// "ACCESSIBILITÉ : il se consomme en moins de 20 minutes". Un bonus de
// 2800 mots ne tient pas cette promesse. La fourchette ci dessous ne
// RABOTE donc pas le contenu : elle fait tenir au prompt ce que le socle
// annonce déjà, et elle retire la marge où le modèle délaye.
//
// Écrire une fourchette plutôt qu'un maximum est délibéré : un maximum
// seul fait viser le maximum, et un plancher empêche le morceau bâclé.

import type { Bloc } from "@/lib/generateurs/blocs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

export interface LongueurMorceau {
  /** La fourchette annoncée au modèle, en mots. */
  mots: { min: number; max: number };
  /** Le filet : au delà, on arrête. Jamais atteint quand la consigne est suivie. */
  plafond: number;
}

/**
 * LE PLAFOND EST DÉRIVÉ, JAMAIS CHOISI À LA MAIN, ET IL NE BAISSE
 * JAMAIS.
 *
 * `max` mots x 1,5 jeton par mot (le français est gourmand) x 3 de
 * marge : il faudrait que le modèle écrive TROIS FOIS la longueur
 * demandée pour être coupé.
 *
 * -- ET SURTOUT : UN PLAFOND SERRÉ N'ÉCONOMISE RIEN -------------------
 *
 * On paie ce qui est ÉCRIT, jamais ce qui était permis. Resserrer le
 * plafond ne fait donc économiser aucun jeton : ça ne fait qu'ajouter
 * du risque de couper un texte au milieu. Mon premier jet dérivait des
 * plafonds PLUS SERRÉS qu'avant (un email passait de 1800 à 900) : ça
 * aurait rendu la troncature plus probable pour zéro euro gagné.
 *
 * D'où `PLANCHER` : le plafond ne descend jamais en dessous de celui
 * d'avant le 4 septembre. Il monte quand la marge le demande, jamais
 * l'inverse.
 *
 * Et le tout est borné par `PLAFOND_DUR` : c'est le budget de temps qui
 * commande le haut, pas l'envie d'avoir de la place.
 */
const JETONS_PAR_MOT = 1.5;
const MARGE = 3;

/** Les plafonds d'avant, qui deviennent des planchers. */
const PLANCHER: Record<string, number> = {
  "bonus:contenu": 4200,
  "bonus:guide": 1800,
  "bonus:remise": 1800,
  "emails:email": 1800,
  "promo:email": 1800,
  "promo:post": 900,
};

/**
 * LE PLAFOND QU'ON NE DÉPASSE JAMAIS, quelle que soit la longueur
 * demandée. Mesuré côté Atelier : au delà, la génération sort du budget
 * de 85 secondes et ne rend rien du tout.
 */
export const PLAFOND_DUR = 4500;

const LONGUEURS: Record<string, { min: number; max: number }> = {
  // Le bonus lui même. C'était le SEUL morceau sans aucune longueur
  // annoncée, et c'est le plus gros poste de sortie : le modèle pouvait
  // écrire jusqu'à ce que le plafond l'arrête, donc jusqu'à ~2800 mots,
  // c'est à dire trois fois plus que ce que le socle promet.
  //
  // 1500 ET PAS 1800, et c'est le seul chiffre que la marge commande :
  // c'est le seul morceau où `PLAFOND_DUR` mord, donc le seul où le
  // filet peut devenir un couperet. À 1500 mots, la coupure tombe à
  // 4500 jetons, soit exactement le DOUBLE de ce qu'on demande.
  "bonus:contenu": { min: 1200, max: 1500 },
  // Le mode d'emploi s'adresse à la créatrice : des étapes, pas un
  // cours. Il n'avait pas de longueur non plus.
  "bonus:guide": { min: 400, max: 700 },
  // Trois textes courts (écran, bouton, email de remise).
  "bonus:remise": { min: 250, max: 450 },
  // Ces trois là avaient déjà leur longueur, écrite DANS la consigne.
  // Elle vit ici maintenant : deux endroits qui disent la longueur
  // finissent toujours par ne plus dire la même chose, et c'est le
  // plafond qui aurait raison contre le texte.
  "emails:email": { min: 200, max: 300 },
  "promo:email": { min: 150, max: 250 },
  "promo:post": { min: 90, max: 150 },
};

/** Ce que ce morceau doit faire, et le filet qui va avec. */
export function longueurDuMorceau(id: GenerateurId, bloc: Bloc): LongueurMorceau {
  // Un morceau qu'on ne connaît pas ne doit pas se retrouver sans
  // plafond : on retombe sur le format le plus court, qui est aussi le
  // plus sûr côté temps.
  const cle = `${id}:${bloc}`;
  const mots = LONGUEURS[cle] ?? { min: 150, max: 300 };
  const derive = Math.ceil((mots.max * JETONS_PAR_MOT * MARGE) / 100) * 100;
  const plafond = Math.min(PLAFOND_DUR, Math.max(derive, PLANCHER[cle] ?? 900));
  return { mots, plafond };
}

/**
 * La phrase qui part dans le prompt.
 *
 * Elle vit dans la consigne, du côté CACHÉ : elle ne dépend que du
 * morceau, jamais de la créatrice.
 */
export function consigneDeLongueur(l: LongueurMorceau): string {
  return `LONGUEUR : entre ${l.mots.min} et ${l.mots.max} mots. C'est une fourchette, pas un objectif à atteindre : en dessous le morceau est bâclé, au dessus il délaye. Si tu as plus à dire que la place, tu coupes ce qui est le moins utile, tu ne rends jamais un texte qui s'arrête au milieu.`;
}
