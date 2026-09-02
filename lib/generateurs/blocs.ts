// lib/generateurs/blocs.ts
//
// CE QU'UN GÉNÉRATEUR PRODUIT, MORCEAU PAR MORCEAU.
//
// -- POURQUOI ON NE GÉNÈRE JAMAIS TOUT D'UN COUP ----------------------
//
// C'est la leçon de l'Atelier, 3 août 2026 : une campagne d'emails
// demandée en un seul appel est sortie EN JSON BRUT à l'écran, devant
// des élèves. La réponse avait été coupée à la limite de tokens, le
// `JSON.parse` avait échoué, et l'écran affichait notre panne au lieu du
// livrable.
//
// Trois appels courts ne peuvent pas se couper l'un l'autre, et un
// morceau qui échoue laisse les autres intacts. C'est aussi ce qui
// permet à l'écran d'afficher une progression honnête au lieu d'une
// roue qui tourne pendant deux minutes.
//
// -- LE MORCEAU EST UN PARAMÈTRE, JAMAIS DEVINÉ -----------------------
//
// `bloc` dit QUOI écrire, `index` dit LEQUEL quand il y en a plusieurs
// du même type (l'email 2 de la séquence), `profilIndex` dit POUR QUI.
// Déduire l'un de l'autre marcherait aujourd'hui et casserait au premier
// générateur qui produit deux séries : c'est la règle du 1er août,
// payée six fois dans ces dépôts.

import type { GenerateurId } from "@/lib/generateurs/catalogue";
import { planFixe } from "@/lib/generateurs/sequences";

/** Les morceaux qu'un générateur peut produire. Liste fermée. */
export const BLOCS = ["contenu", "guide", "remise", "email", "post"] as const;
export type Bloc = (typeof BLOCS)[number];

/**
 * Ce que chaque générateur produit, DANS L'ORDRE où l'écran l'affiche.
 *
 * - bonus : le bonus lui même, puis comment le fabriquer, puis le texte
 *   qui le remet au visiteur ;
 * - emails : une séquence, donc N fois le même bloc `email` ;
 * - promo : des emails d'invitation ET des posts, deux séries.
 */
export const BLOCS_DU_GENERATEUR: Record<GenerateurId, readonly Bloc[]> = {
  bonus: ["contenu", "guide", "remise"],
  emails: ["email"],
  promo: ["email", "post"],
};

/**
 * Ce bloc se répète-t-il (une série numérotée) ?
 *
 * Un bloc répété EXIGE son `index` : sans lui, deux appels écriraient le
 * même email et la créatrice recevrait deux fois le premier.
 */
export function blocRepete(bloc: Bloc): boolean {
  return bloc === "email" || bloc === "post";
}

/** Ce générateur peut-il produire ce bloc ? */
export function blocAutorise(id: GenerateurId, bloc: Bloc): boolean {
  return BLOCS_DU_GENERATEUR[id].includes(bloc);
}

/**
 * Un morceau à produire, tel que la piste choisie le déclare.
 *
 * `resume` est la ligne que le modèle a écrite à l'étape des pistes
 * ("email 2 : lever l'objection du temps"). On la lui redonne à la
 * production : sans elle il réécrit l'email 1 sous un autre titre.
 */
export interface Piece {
  bloc: Bloc;
  /** 1-based, et seulement sur un bloc répété. */
  index: number;
  resume: string;
  /** La clé i18n du rôle, sur les générateurs à plan fixe. L'écran la traduit. */
  cle?: string;
}

/**
 * Une piste, telle que l'étape 1 la rend et que l'écran la montre.
 *
 * `pieces` est ce que la production va écrire. C'est la piste qui le
 * déclare, et pas un réglage de plus à l'écran : le nombre d'emails
 * d'une séquence dépend du sujet, pas d'une préférence.
 */
export interface Piste {
  titre: string;
  /** La forme du livrable, en trois mots ("checklist", "mini audit"). */
  format: string;
  /** La phrase qui donne envie, celle qu'on lit sur la carte. */
  punchline: string;
  /** Pourquoi cette piste là pour CE quiz. */
  pourquoi: string;
  pieces: Piece[];
}

/** Combien de morceaux au maximum, par générateur. */
export const MAX_PIECES: Record<GenerateurId, number> = {
  // Trois blocs fixes, imposés par nous : voir ci-dessous.
  bonus: 3,
  // Une séquence post-quiz au delà de 6 emails ne se lit plus, et
  // surtout elle ne s'écrit pas : la créatrice abandonne en route.
  emails: 6,
  // 3 emails + 5 posts : de quoi lancer un quiz sans y passer la
  // semaine. Au delà, on produit du contenu que personne ne publiera.
  promo: 8,
};

const nettoyer = (v: unknown): string => String(v ?? "").trim();

/**
 * Les morceaux que la production va écrire.
 *
 * -- LE BONUS NE LAISSE PAS LE MODÈLE DÉCIDER -------------------------
 *
 * Ses trois blocs sont TOUJOURS les mêmes, et c'est nous qui les
 * imposons : le contenu, le guide de fabrication, le texte de remise. Un
 * modèle à qui on demanderait "de quoi as tu besoin" en oublierait un
 * une fois sur trois, et la créatrice se retrouverait avec un bonus
 * qu'elle ne sait pas livrer (retour Béné, 5 août : le guide retombait
 * sur "monte un tableau dans Google Sheets").
 *
 * Pour les deux autres, le NOMBRE est une décision éditoriale qui dépend
 * du sujet : c'est la piste qui le porte, bornée ici.
 */
export function piecesDeLaPiste(
  id: GenerateurId,
  declarees: { bloc?: unknown; index?: unknown; resume?: unknown }[] | null | undefined,
): Piece[] {
  if (id === "bonus") {
    return BLOCS_DU_GENERATEUR.bonus.map((bloc, i) => ({
      bloc,
      index: i + 1,
      resume: "",
    }));
  }

  // LES DEUX AUTRES ONT UN PLAN FIXE, ET LE MODÈLE N'EN DÉCIDE RIEN.
  //
  // Béné, 2 septembre 2026 : "le générateur d'emails ne génère pas 'des
  // pistes' mais des emails putain t'as fait n'imp." Une séquence
  // post-quiz a des temps fixes (voir `sequences.ts`, portés de
  // l'Atelier) : il n'y a pas de piste à choisir, il y a des emails à
  // écrire. Ce qui suit était la mécanique du bonus appliquée aux trois.
  const plan = planFixe(id);
  if (plan) {
    const compteursDuPlan = new Map<Bloc, number>();
    return plan.slice(0, MAX_PIECES[id]).map((temps) => {
      const n = (compteursDuPlan.get(temps.bloc) ?? 0) + 1;
      compteursDuPlan.set(temps.bloc, n);
      // `resume` porte l'INTENTION du temps : c'est elle qui distingue
      // l'email 2 de l'email 3. Sans elle, le modèle réécrit cinq fois
      // le premier sous cinq titres.
      return { bloc: temps.bloc, index: n, resume: temps.intention, cle: temps.cle };
    });
  }

  const compteurs = new Map<Bloc, number>();
  const pieces: Piece[] = [];

  for (const brute of declarees ?? []) {
    const bloc = nettoyer(brute?.bloc) as Bloc;
    if (!BLOCS.includes(bloc) || !blocAutorise(id, bloc)) continue;
    // L'INDEX EST RECALCULÉ, jamais recopié du modèle. Il rend parfois
    // deux "email 1", ou saute de 1 à 3 : une numérotation à trou fait
    // écrire deux fois le même email et en oublier un autre, en silence.
    const n = (compteurs.get(bloc) ?? 0) + 1;
    compteurs.set(bloc, n);
    pieces.push({ bloc, index: n, resume: nettoyer(brute?.resume) });
    if (pieces.length >= MAX_PIECES[id]) break;
  }

  return pieces;
}
