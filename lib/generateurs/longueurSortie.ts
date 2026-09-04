// lib/generateurs/longueurSortie.ts
//
// COMBIEN CHAQUE MORCEAU DOIT FAIRE, ET COMMENT IL SORT EN ENTIER.
//
// Béné, 4 septembre 2026 : "tout ce que je veux c'est que rien ne doit
// tronqué ni annulé : si la sortie doit faire 20000 mots ben elle en
// 20000 c'est tout. Un email qui demande à faire XX mots ben il sort XX
// mots, on ne détruit jamais la qualité."
//
// -- CE QUE J'AVAIS FAIT DE TRAVERS LE MATIN MÊME ---------------------
//
// Deux fautes, et les deux vont contre cette phrase :
//
//   1. j'avais RABOTÉ le contenu d'un bonus de 1800 à 1500 mots, pour
//      qu'il tienne sous un plafond technique. C'est exactement "on
//      détruit la qualité pour économiser" ;
//   2. j'avais ajouté un REFUS quand le texte dépassait quand même. Un
//      refus, c'est une annulation : elle repart avec rien.
//
// Les deux sont retirées. La fourchette de mots est une consigne
// ÉDITORIALE, jamais un budget : un email de 250 mots doit faire
// 250 mots parce que c'est la bonne longueur d'un email, pas parce que
// ça coûte moins cher.
//
// -- LA SEULE CONTRAINTE QUI EXISTE VRAIMENT, ET ELLE EST DE TEMPS ----
//
// Mesuré en production côté Atelier (`app/api/me/bonus/route.ts`,
// 5 août) : au delà de ~4500 jetons de sortie, UN appel dépasse les
// 85 secondes du budget et rend ZÉRO ligne. Ce n'est pas une limite de
// contenu, c'est le temps qu'une requête HTTP a le droit de durer
// derrière Cloudflare.
//
// D'où la seule bonne réponse : on n'écrit pas moins, on écrit en
// PLUSIEURS TRANCHES. Le modèle reprend exactement là où il s'est
// arrêté (prefill), et on recolle. Rien n'est coupé, rien n'est jeté,
// et un contenu de 20000 mots sort en 20000 mots : il prend juste
// plusieurs tranches.
//
// -- COMMENT ON REPREND, ET POURQUOI PAS PAR UN PREFILL ---------------
//
// Le réflexe est de reposer le texte déjà écrit en dernier message
// `assistant` (le "prefill") : le modèle continue alors au caractère
// près. C'est ce que j'avais écrit, et **ça ne marche pas ici** :
//
//   les générateurs tournent sur `claude-sonnet-4-6`, et le prefill
//   d'un message assistant y répond 400 (il est retiré de toute la
//   famille 4.6+ et des modèles 5). Chaque suite aurait donc échoué,
//   et l'écran aurait dit "la demande a été refusée" sans plus.
//
// La suite passe donc par le MESSAGE, avec le texte déjà écrit et la
// consigne de reprendre sans rien répéter. Et comme un nouveau tour ne
// peut pas reprendre proprement au milieu d'un mot, on recule d'abord
// jusqu'à une frontière propre (`couperPourReprendre`) : les quelques
// mots retirés sont réécrits par la suite, donc rien ne se perd.
//
// -- ET LA LONGUEUR N'EST PAS UN BUDGET, C'EST UNE PROMESSE -----------
//
// Écrire une fourchette plutôt qu'un maximum est délibéré : un maximum
// seul fait viser le maximum, et un plancher empêche le morceau bâclé.
// Le modèle est libre de dépasser quand le sujet le demande : la suite
// s'écrira dans la tranche d'après.

import type { Bloc } from "@/lib/generateurs/blocs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

export interface LongueurMorceau {
  /** La fourchette annoncée au modèle, en mots. Une intention, pas un couperet. */
  mots: { min: number; max: number };
  /**
   * La taille d'UNE tranche d'écriture, en jetons. Ce n'est PAS la
   * longueur du contenu : ce qui dépasse s'écrit dans la tranche
   * suivante.
   */
  trancheMax: number;
}

/**
 * LA TAILLE D'UNE TRANCHE, ET POURQUOI ELLE NE BOUGE PAS.
 *
 * C'est le budget de TEMPS qui la fixe, pas l'envie d'avoir de la
 * place : au delà, l'appel dépasse les 85 secondes et ne rend rien du
 * tout. Monter ce nombre n'achète pas un texte plus long, ça achète une
 * page blanche.
 *
 * Et le descendre n'économise RIEN : on paie ce qui est ÉCRIT, jamais
 * ce qui était permis. Ça ne ferait qu'ajouter des allers-retours.
 */
export const TRANCHE_MAX = 4500;

/**
 * Combien de tranches on enchaîne avant de rendre la main.
 *
 * 6 tranches, c'est ~27000 jetons, donc ~18000 mots pour un seul
 * morceau. Au delà, l'écran affiche "Écrire la suite" et elle relance :
 * on ne s'arrête JAMAIS sur un refus, on rend toujours ce qui est écrit
 * avec de quoi continuer.
 */
export const MAX_TRANCHES = 6;

const LONGUEURS: Record<string, { min: number; max: number }> = {
  // Le bonus lui même. C'était le SEUL morceau sans aucune longueur
  // annoncée, donc le modèle écrivait au jugé, sans savoir s'il devait
  // rendre deux pages ou dix.
  //
  // 1800 ET PAS 1500 : j'avais baissé ce chiffre le matin même pour
  // qu'il tienne dans une tranche. C'est la tranche qui s'adapte au
  // contenu, jamais l'inverse.
  "bonus:contenu": { min: 1200, max: 1800 },
  // Le mode d'emploi s'adresse à la créatrice : des étapes, pas un
  // cours. Il n'avait pas de longueur non plus.
  "bonus:guide": { min: 400, max: 700 },
  // Trois textes courts (écran, bouton, email de remise).
  "bonus:remise": { min: 250, max: 450 },
  // Ces trois là avaient déjà leur longueur, écrite DANS la consigne.
  // Elle vit ici maintenant : deux endroits qui disent la longueur
  // finissent toujours par ne plus dire la même chose.
  "emails:email": { min: 200, max: 300 },
  "promo:email": { min: 150, max: 250 },
  "promo:post": { min: 90, max: 150 },
};

/** Ce que ce morceau doit faire, et la taille d'une tranche d'écriture. */
export function longueurDuMorceau(id: GenerateurId, bloc: Bloc): LongueurMorceau {
  // Un morceau qu'on ne connaît pas garde la MÊME tranche que les
  // autres : ce n'est pas parce qu'on ne sait pas quoi lui demander
  // qu'il doit sortir amputé.
  const mots = LONGUEURS[`${id}:${bloc}`] ?? { min: 150, max: 300 };
  return { mots, trancheMax: TRANCHE_MAX };
}

/**
 * La phrase qui part dans le prompt.
 *
 * Elle vit dans la consigne, du côté CACHÉ : elle ne dépend que du
 * morceau, jamais de la créatrice.
 *
 * ELLE NE DIT PAS "COUPE". Une consigne qui demande de raccourcir fait
 * rendre un sommaire à la place d'un contenu : c'est précisément la
 * qualité qu'on refuse de détruire. Elle dit la bonne longueur, et
 * laisse le sujet commander quand il faut plus.
 */
export function consigneDeLongueur(l: LongueurMorceau): string {
  return `LONGUEUR : vise entre ${l.mots.min} et ${l.mots.max} mots. C'est la longueur qui sert le mieux ce morceau, pas un plafond : si le sujet demande plus, tu écris plus et tu vas au bout. Tu ne rends jamais un résumé de ce que tu aurais pu écrire, et tu ne t'arrêtes jamais au milieu d'une phrase ou d'une section.`;
}

/** Où reprendre, et avec quoi recoller. */
export interface Reprise {
  /** Ce qu'on garde : le texte ramené à une frontière propre. */
  garde: string;
  /** Ce qu'on insère entre le gardé et la suite. */
  joint: string;
}

/**
 * RAMÈNE UN TEXTE COUPÉ À UNE FRONTIÈRE PROPRE.
 *
 * Une tranche s'arrête où le plafond tombe, donc souvent au milieu d'un
 * mot. Sans prefill, le modèle ne peut pas reprendre là : on recule
 * jusqu'au dernier paragraphe, sinon jusqu'à la dernière phrase finie.
 *
 * CE QU'ON RETIRE N'EST PAS PERDU : c'est la suite qui le réécrit, et
 * elle a tout le texte sous les yeux. On préfère réécrire trois lignes
 * que livrer une couture au milieu d'un mot.
 *
 * Un texte sans aucune frontière (un seul bloc d'un bout à l'autre) est
 * gardé ENTIER : une couture imparfaite vaut mieux qu'un texte jeté.
 */
export function couperPourReprendre(texte: string): Reprise {
  const net = texte.replace(/\s+$/, "");
  const paragraphe = net.lastIndexOf("\n\n");
  // On exige qu'il reste de la matière avant la coupure : reculer
  // jusqu'au tout début reviendrait à tout jeter.
  if (paragraphe > net.length / 4) {
    return { garde: net.slice(0, paragraphe).replace(/\s+$/, ""), joint: "\n\n" };
  }
  const phrase = /^[\s\S]*[.!?…][»"')\]]?(?=\s)/.exec(net);
  if (phrase && phrase[0].length > net.length / 4) {
    return { garde: phrase[0].replace(/\s+$/, ""), joint: " " };
  }
  return { garde: net, joint: " " };
}
