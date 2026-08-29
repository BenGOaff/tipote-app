// lib/affiliate/importApercu.ts
//
// CE QU'ON MONTRE AVANT D'ÉCRIRE UN AFFILIÉ (29 août 2026).
//
// Chaque ligne de l'import crée quelqu'un qui pourra être PAYÉ, et lui
// attribue un code PUBLIC qui finira dans ses liens. Deux erreurs sont
// donc invisibles au moment où elles se commettent, et coûteuses après.
//
// 1. UN IDENTIFIANT MAL RECOPIÉ. Un `sa` est un hash de 40 caractères
//    qui se recopie à la main depuis un écran. Un caractère faux passe
//    tous les contrôles de FORME (c'est un `sa` parfaitement valide) et
//    crée un affilié fantôme : il n'attribuera jamais rien, et personne
//    ne le remarquera puisqu'il n'y a aucun symptôme. C'est arrivé le
//    jour même de l'écriture de ce fichier, sur une liste relue à l'oeil.
//
//    D'où la règle : on CONFRONTE chaque identifiant à ses propres
//    données. Un `sa` qui n'a jamais produit ni un clic ni un contact
//    est SIGNALÉ. Signalé, pas refusé : un affilié tout neuf n'a encore
//    rien envoyé, et lui fermer la porte serait pire que le doute.
//
// 2. UN CODE PUBLIC QU'ELLE DÉCOUVRE APRÈS COUP. Le code sort dans les
//    liens que l'affilié va publier, et un ancien code reste réservé
//    pour toujours (`affiliate_ref_aliases`). On le montre donc AVANT,
//    calculé par la même fonction que l'attribution réelle.
//
// PUR : aucune lecture de base ici, l'appelant apporte ce qu'il a lu.

import { REF_MIN_LENGTH, suggestRef } from "@/lib/affiliate/ref";
import type { AffilieAImporter } from "@/lib/affiliate/importSio";

/** Ce que ses propres données savent d'un identifiant. */
export interface ActiviteSa {
  clics: number;
  contacts: number;
}

export interface LigneApercu {
  sa: string;
  email: string;
  nom: string | null;
  /** Le code public qui lui sera proposé, ou "" si rien d'exploitable. */
  code: string;
  /** Ce code est déjà celui de quelqu'un d'autre : un suffixe sera ajouté. */
  codePris: boolean;
  clics: number;
  contacts: number;
  /** Cet identifiant existe déjà dans le registre. */
  existant: boolean;
  /**
   * Jamais vu dans ses clics ni dans ses contacts. Probable faute de
   * recopie, ou affilié qui n'a encore rien envoyé.
   */
  jamaisVu: boolean;
}

/**
 * Annote les lignes lues avec ce qu'on sait déjà d'elles.
 *
 * `activite` : ce que ses clics et ses conversions portent, par `sa`.
 * `refsPris` : les codes publics déjà attribués, en minuscules, avec le
 *   `sa` de leur propriétaire (pour ne pas crier sur son propre code).
 * `existants` : les `sa` déjà présents dans le registre.
 */
export function annoterImport(
  affilies: readonly AffilieAImporter[],
  activite: ReadonlyMap<string, ActiviteSa>,
  refsPris: ReadonlyMap<string, string>,
  existants: ReadonlySet<string>,
): LigneApercu[] {
  return affilies.map((a) => {
    const vu = activite.get(a.sa) ?? { clics: 0, contacts: 0 };
    const code = suggestRef(a.nom, a.email);
    const proprietaire = code.length >= REF_MIN_LENGTH ? refsPris.get(code) : undefined;

    return {
      sa: a.sa,
      email: a.email,
      nom: a.nom,
      code,
      codePris: Boolean(proprietaire && proprietaire !== a.sa),
      clics: vu.clics,
      contacts: vu.contacts,
      existant: existants.has(a.sa),
      // Un identifiant DÉJÀ dans le registre n'a pas à se justifier :
      // il a été validé une fois, l'absence de trafic ne veut plus rien
      // dire sur lui.
      jamaisVu: !existants.has(a.sa) && vu.clics === 0 && vu.contacts === 0,
    };
  });
}
