// lib/integrations/champsContact.ts
//
// LES CHAMPS PERSONNALISÉS DU FORMULAIRE PARTENT DANS LA FICHE CONTACT
// (Béné, 16 septembre 2026 : "oui il faut envoyer à systeme io et ghl").
//
// PUR : aucune base, aucun réseau. Ce module décide de DEUX choses, et
// les adaptateurs ne font que les exécuter :
//
//  1. quels champs partent, sous quel nom et sous quel slug ;
//  2. côté GoHighLevel, quels champs existent déjà, lesquels créer, et
//     par quel identifiant écrire chaque valeur.
//
// -- LE SLUG EST STABLE, LE NOM SUIT LE LIBELLÉ ---------------------------
//
// Un champ a une IDENTITÉ (`cf_xxxxxx`, règle du 16 septembre) : renommer
// "Ta ville" en "Ville" ne perd aucune donnée chez nous. Chez Systeme.io
// c'est le SLUG qui identifie un champ de contact, et il ne se renomme
// pas : il est donc dérivé de l'id (`tiquiz_cf_xxxxxx`), et c'est le
// `fieldName`, celui que la créatrice lit dans son tableau de bord, qui
// porte le libellé du jour. Un slug dérivé du libellé fabriquerait un
// DEUXIÈME champ au premier renommage, et l'historique des contacts se
// couperait en deux sans que rien ne le dise.
//
// Le PRÉFIXE est un paramètre : Tiquiz écrit `tiquiz_`, Tipote `tipote_`
// (comme `tiquiz_result` et `tipote_quiz_result` pour le profil). Ce
// module est identique à l'octet près dans les deux dépôts :
//
//   cmp lib/integrations/champsContact.ts ../tipote-app/lib/integrations/champsContact.ts
//
// -- CHEZ GOHIGHLEVEL, ON NE CHOISIT PAS LA CLÉ -------------------------
//
// Leur API dérive `fieldKey` du NOM (`contact.ta_ville`) : on ne peut pas
// lui imposer notre slug. Un champ s'y retrouve donc par son NOM, et un
// libellé renommé y crée un nouveau champ (l'ancien garde ses valeurs).
// C'est dit dans le guide, ce n'est pas caché.
//
// -- UN SLUG INCONNU EST ACCEPTÉ ET IGNORÉ PAR SYSTEME.IO --------------
//
// Mesuré le 25 août 2026 (`lib/sio/contactFields.ts`) : écrire un champ
// dont le slug n'existe pas ne rend AUCUNE erreur, la valeur disparaît.
// C'est pour ça que l'adaptateur ASSURE l'existence du champ
// (`POST /contact_fields`) avant d'écrire la valeur, et jamais l'inverse.

import { champsVisibles, type ChampPersonnalise, type ValeursChamps } from "@/lib/quiz/champsPersonnalises";

/** Ce qu'un adaptateur reçoit : un champ nommé, avec sa valeur. */
export interface ChampContactPerso {
  /** L'identité chez nous (`cf_xxxxxx`). */
  id: string;
  /** Le slug stable chez Systeme.io (`<prefixe>_cf_xxxxxx`). */
  slug: string;
  /** Le nom lisible : le libellé du jour. */
  nom: string;
  /** La valeur saisie par le visiteur, jamais vide. */
  valeur: string;
}

/** Systeme.io borne `fieldName` à 255 caractères. */
export const MAX_NOM_CHAMP_CONTACT = 255;

/** Systeme.io exige `^\w+$` pour un slug de champ de contact. */
const SLUG_VALIDE = /^\w+$/;

/** Le slug d'un champ chez Systeme.io : le préfixe de l'app, puis l'id. */
export function slugChampContact(prefixe: string, id: string): string | null {
  const p = String(prefixe ?? "").trim();
  const i = String(id ?? "").trim();
  // Sans préfixe, le slug serait celui de l'AUTRE app : on refuse.
  if (!p || !i) return null;
  const slug = `${p}_${i}`;
  return SLUG_VALIDE.test(slug) ? slug : null;
}

/**
 * Les champs à écrire dans la fiche contact : ceux qui ont un libellé
 * (un champ sans nom n'existe pas pour le visiteur, règle du
 * 16 septembre) ET une valeur. On n'envoie JAMAIS un champ vide :
 * Systeme.io traite une chaîne vide comme une valeur, et écraserait ce
 * que la créatrice a peut être saisi à la main.
 */
export function champsContactPersonnalises(
  prefixe: string,
  champs: readonly ChampPersonnalise[],
  valeurs: ValeursChamps | null | undefined,
): ChampContactPerso[] {
  if (!valeurs) return [];
  const sortie: ChampContactPerso[] = [];
  for (const champ of champsVisibles([...champs])) {
    const valeur = String(valeurs[champ.id] ?? "").trim();
    if (!valeur) continue;
    const slug = slugChampContact(prefixe, champ.id);
    if (!slug) continue;
    sortie.push({
      id: champ.id,
      slug,
      nom: champ.label.trim().slice(0, MAX_NOM_CHAMP_CONTACT),
      valeur,
    });
  }
  return sortie;
}

// ── GoHighLevel : quoi écrire, quoi créer ─────────────────────────────

/** Un champ personnalisé tel que `GET /locations/{id}/customFields` le rend. */
export interface ChampGhlExistant {
  id: string;
  name: string;
  fieldKey?: string | null;
}

/** Un champ qu'on veut écrire sur le contact. */
export interface ChampGhlVoulu {
  /** Le nom du champ chez eux ; c'est par lui qu'on le retrouve. */
  nom: string;
  valeur: string;
  /**
   * Une clé connue (`tiquiz_resultat`) : on cherche d'abord
   * `contact.<cle>`, pour retrouver un champ créé à la main avant que
   * l'app ne sache les créer.
   */
  cle?: string | null;
}

export interface PlanChampsGhl {
  /** Les valeurs à écrire, par identifiant de champ. */
  aEcrire: { id: string; valeur: string }[];
  /** Les champs à créer d'abord, dans l'ordre des voulus. */
  aCreer: { nom: string; valeur: string }[];
}

/** Deux noms de champ sont le même champ, quelle que soit la casse ou les espaces. */
export function memeNomDeChamp(a: string, b: string): boolean {
  const n = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const na = n(a);
  return na !== "" && na === n(b);
}

/**
 * Décide, à partir des champs existants du sous-compte, ce qui s'écrit
 * tout de suite et ce qui doit être créé avant. Un voulu se retrouve
 * par sa clé (`contact.<cle>`) d'abord, par son nom ensuite. Deux voulus
 * qui portent le même nom ne font créer QU'UN champ : le second attend
 * la création du premier et sera écrit au passage suivant.
 */
export function planifierChampsGhl(
  existants: readonly ChampGhlExistant[],
  voulus: readonly ChampGhlVoulu[],
): PlanChampsGhl {
  const plan: PlanChampsGhl = { aEcrire: [], aCreer: [] };
  for (const v of voulus) {
    const nom = String(v.nom ?? "").trim();
    const valeur = String(v.valeur ?? "").trim();
    if (!nom || !valeur) continue;
    const cle = String(v.cle ?? "").trim();
    const parCle = cle
      ? existants.find((e) => String(e.fieldKey ?? "").toLowerCase() === `contact.${cle}`.toLowerCase())
      : undefined;
    const trouve = parCle ?? existants.find((e) => memeNomDeChamp(e.name, nom));
    if (trouve) {
      plan.aEcrire.push({ id: trouve.id, valeur });
      continue;
    }
    if (!plan.aCreer.some((c) => memeNomDeChamp(c.nom, nom))) {
      plan.aCreer.push({ nom, valeur });
    }
  }
  return plan;
}
