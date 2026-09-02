// lib/generateurs/parcours.ts
//
// LE PARCOURS D'UN GÉNÉRATEUR : des ÉTAPES qui s'enchaînent, pas une
// page qui empile.
//
// Béné, 2 septembre 2026 : "de manière générale tu n'as pas repris la
// belle mise en page facile de l'Atelier [...] fais plutôt plusieurs
// étapes qui s'enchaînent qu'une longue page qui empile les infos."
//
// L'écran affichait TOUT en même temps : le projet, le profil, l'offre,
// les pistes et les contenus, les uns sous les autres. À l'ouverture, on
// voyait donc quatre sections dont trois qu'on ne peut pas encore
// remplir. L'Atelier fait l'inverse depuis le début
// (`library -> brief -> pistes -> produce`), et c'est ce qu'elle
// demande ici.
//
// -- LES ÉTAPES DÉPENDENT DU GÉNÉRATEUR, ET C'EST TOUT L'INTÉRÊT ------
//
// La PROMO ne demande ni profil ni offre : lui faire traverser une
// étape vide serait un clic pour rien. Les EMAILS et la PROMO ne passent
// pas par les pistes (voir `sequences.ts`) : leur séquence est fixe.
//
//   bonus  : projet -> réglages -> pistes -> contenus
//   emails : projet -> réglages -> contenus
//   promo  : projet -> contenus
//
// -- CE MODULE NE REND AUCUNE PHRASE ---------------------------------
//
// Il rend des identifiants d'étape. L'interface existe en 7 langues, et
// c'est l'écran qui écrit.

import {
  demandeUnProfil,
  demandeUneOffre,
  type GenerateurId,
} from "@/lib/generateurs/catalogue";
import { passeParLesPistes } from "@/lib/generateurs/sequences";

/** Les étapes possibles, dans l'ordre où elles peuvent apparaître. */
export const ETAPES = ["projet", "reglages", "pistes", "contenus"] as const;
export type Etape = (typeof ETAPES)[number];

/** Les étapes de CE générateur, dans l'ordre. */
export function etapesDuParcours(id: GenerateurId): Etape[] {
  const etapes: Etape[] = ["projet"];
  if (demandeUnProfil(id) || demandeUneOffre(id)) etapes.push("reglages");
  if (passeParLesPistes(id)) etapes.push("pistes");
  etapes.push("contenus");
  return etapes;
}

/** Ce qu'il faut avoir rempli pour quitter une étape. */
export interface EtatParcours {
  /** Un projet est choisi ET ce générateur peut tourner dessus. */
  projetPret: boolean;
  /** Le profil demandé existe (ou le générateur n'en demande pas). */
  profilPret: boolean;
  /** L'offre est décrite (ou le générateur n'en demande pas). */
  offrePrete: boolean;
  /** Au moins une piste est revenue (bonus seulement). */
  pistesPretes: boolean;
}

/**
 * Peut-on passer à l'étape suivante ?
 *
 * On BLOQUE plutôt que de laisser avancer vers un écran qui ne peut
 * rien produire : c'est la même raison qui fait afficher un projet
 * bloqué avec sa cause au lieu de le cacher.
 */
export function peutAvancer(etape: Etape, etat: EtatParcours): boolean {
  if (etape === "projet") return etat.projetPret;
  if (etape === "reglages") return etat.profilPret && etat.offrePrete;
  if (etape === "pistes") return etat.pistesPretes;
  return false;
}

/** L'étape suivante, ou `null` sur la dernière. */
export function suivante(id: GenerateurId, etape: Etape): Etape | null {
  const l = etapesDuParcours(id);
  return l[l.indexOf(etape) + 1] ?? null;
}

/** L'étape précédente, ou `null` sur la première. */
export function precedente(id: GenerateurId, etape: Etape): Etape | null {
  const l = etapesDuParcours(id);
  const i = l.indexOf(etape);
  return i > 0 ? (l[i - 1] ?? null) : null;
}

/**
 * L'étape où atterrir quand une étape disparaît du parcours.
 *
 * Un écran ouvert sur "pistes" pour un générateur qui n'en a plus ne
 * doit pas rester bloqué sur une étape fantôme : on retombe sur la
 * PREMIÈRE, jamais sur la dernière (arriver sur "contenus" sans avoir
 * choisi de projet montrerait un écran vide sans dire pourquoi).
 */
export function etapeValide(id: GenerateurId, etape: string): Etape {
  const l = etapesDuParcours(id);
  return (l.includes(etape as Etape) ? (etape as Etape) : l[0]) as Etape;
}
