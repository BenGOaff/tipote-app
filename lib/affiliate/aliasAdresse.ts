// lib/affiliate/aliasAdresse.ts
//
// RETROUVER LE RATTACHEMENT DE QUELQU'UN, ALIAS COMPRIS.
//
// Béné, 12 septembre 2026 : "oui on normalise pour gmail stp."
//
// Jusque là, la conversion (le rattachement à vie d'un inscrit à son
// affilié) se cherchait sur l'adresse BRUTE : quelqu'un inscrit en
// `bene+tiquiz@gmail.com` qui achetait ensuite en `bene@gmail.com` ne
// retrouvait pas son affilié par cette voie. Le `?ref=` du lien, lui,
// marchait ; mais un achat fait sans repasser par le lien perdait la
// commission, en silence.
//
// L'anti-auto-affiliation normalisait DÉJÀ (`memeAdresse.ts`, audit du
// 26 août). On protégeait donc la fraude mieux que l'affilié honnête :
// deux règles pour la même question, la plus faible sur l'argent.
//
// -- COMMENT ON CHERCHE, ET POURQUOI PAS AUTREMENT ----------------------
//
// On ne peut pas énumérer les alias d'une adresse (il y en a une
// infinité : chaque `+truc` en est un). On ne peut pas non plus
// normaliser en SQL sans écrire la règle UNE DEUXIÈME FOIS, dans une
// autre langue, à un endroit qu'aucun test ne peut charger : c'est le
// motif des deux jumeaux qui divergent, payé six fois dans ce dépôt.
//
// D'où le partage des rôles :
//   1. `motifAliasAdresse()` fabrique une EXPRESSION RÉGULIÈRE qui ne
//      reconnaît que les formes de la même boîte (`^b\.?e\.?n\.?e
//      (\+[^@]*)?@(gmail|googlemail)\.com$`), et la base ne rend que ces
//      lignes là. C'est un FILTRE, il rétrécit ce qu'on lit.
//   2. `premiereLigneDeLaPersonne()` DÉCIDE, en JavaScript, avec LA MÊME
//      fonction que l'anti-auto-affiliation (`normaliserAdresse`). Si la
//      base rendait une ligne de trop, elle serait écartée ici.
//
// Une seule règle, une seule fonction, deux usages. Et ce module reste
// PUR : il n'importe jamais `supabaseAdmin`, sinon aucun test ne
// pourrait le charger (règle du 1er août).
//
// LE PREMIER RATTACHEMENT GAGNE, alias compris : `lignes` arrive triée
// du plus ancien au plus récent, et on rend la première qui désigne la
// personne. C'est celui qui a AMENÉ quelqu'un qui le garde.

import { normaliserAdresse } from "@/lib/affiliate/memeAdresse";

/** Les domaines où les points du nom local ne comptent pas. Même liste que `memeAdresse.ts`. */
const DOMAINES_GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** Un caractère rendu littéral dans une expression régulière POSIX (Postgres) et JavaScript. */
function litteral(c: string): string {
  return /[.*+?^${}()|[\]\\\/-]/.test(c) ? `\\${c}` : c;
}

/**
 * L'expression régulière (insensible à la casse) qui reconnaît TOUTES les
 * adresses qui arrivent dans la même boîte que `email`, et aucune autre.
 *
 * - le `+suffixe` est accepté partout (la convention est générale) ;
 * - chez Gmail, un point est accepté entre deux caractères du nom, et
 *   `gmail.com` vaut `googlemail.com` ;
 * - ailleurs, les points sont LITTÉRAUX : `jean.dupont@` et `jeandupont@`
 *   peuvent être deux personnes.
 *
 * Rend `null` sur une adresse qu'on ne sait pas lire : l'appelant retombe
 * alors sur la comparaison exacte, jamais sur un motif qui matcherait
 * tout le monde.
 */
export function motifAliasAdresse(email: unknown): string | null {
  const norm = normaliserAdresse(email);
  const at = norm.lastIndexOf("@");
  if (at <= 0 || at === norm.length - 1) return null;
  const local = norm.slice(0, at);
  const domaine = norm.slice(at + 1);
  if (DOMAINES_GMAIL.has(domaine)) {
    const lettres = Array.from(local).map(litteral).join("\\.?");
    return `^${lettres}(\\+[^@]*)?@(gmail|googlemail)\\.com$`;
  }
  const localLitteral = Array.from(local).map(litteral).join("");
  const domaineLitteral = Array.from(domaine).map(litteral).join("");
  return `^${localLitteral}(\\+[^@]*)?@${domaineLitteral}$`;
}

/**
 * La PREMIÈRE ligne (dans l'ordre reçu) dont l'adresse désigne la même
 * personne que `email`. `null` quand aucune ne la désigne, ou quand
 * `email` est vide : "je ne sais pas" n'est pas "c'est la même".
 */
export function premiereLigneDeLaPersonne<T extends { email: string | null | undefined }>(
  lignes: readonly T[],
  email: unknown,
): T | null {
  const cible = normaliserAdresse(email);
  if (!cible) return null;
  for (const l of lignes) {
    if (normaliserAdresse(l.email) === cible) return l;
  }
  return null;
}
