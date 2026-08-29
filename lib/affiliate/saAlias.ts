// lib/affiliate/saAlias.ts
//
// CE QU'ON FAIT D'UN IDENTIFIANT DONT L'ADRESSE EXISTE DÉJÀ.
//
// Béné importe ses affiliés Systeme.io. Une ligne est refusée :
//
//   sa0134…  duplicate key value violates unique constraint
//            "affiliates_email_key"
//
// La contrainte porte sur l'EMAIL, pas sur l'identifiant. Eric avait
// déjà une ligne, sous un AUTRE identifiant Systeme.io. Les deux sont
// à lui, et ses liens en circulation portent celui qui n'existait pas.
//
// -- TROIS ISSUES, ET UNE SEULE EST BONNE ------------------------------
//
// 1. Créer une deuxième ligne : INTERDIT. Deux lignes = deux personnes
//    à payer, deux versements, deux autofactures pour un seul homme.
// 2. Réécrire la clé de sa ligne existante : INTERDIT. `affiliates.sa`
//    est référencé par ses clics, ses conversions, ses commissions et
//    ses versements. La changer déplace son historique.
// 3. Poser un ALIAS : l'ancien identifiant DÉSIGNE sa ligne. C'est le
//    mécanisme qui existe déjà pour les codes publics depuis le 19 août.
//
// -- CE QUI RESTE INTERDIT, ET C'EST DE L'ARGENT ----------------------
//
// On n'aliasse JAMAIS deux identifiants qui appartiennent à deux
// adresses différentes. Un alias fait tomber tout le trafic d'un
// identifiant dans la poche d'un autre : c'est irréversible du point de
// vue d'un versement déjà parti. L'égalité d'adresse est donc la
// SEULE condition, et elle passe par la comparaison qui voit les alias
// Gmail (`memePersonne`), la même qui empêche l'auto-affiliation.
//
// PUR : aucune lecture de base ici. L'appelant apporte ce qu'il a lu.

import { memePersonne } from "@/lib/affiliate/memeAdresse";

/** Ce que l'import doit faire d'une ligne. */
export type ActionImport =
  | { action: "creer" }
  | { action: "deja-la"; sa: string }
  | { action: "alias"; vers: string }
  | { action: "refuser"; raison: "email-pris-par-un-autre" };

/**
 * Que faire de cette ligne d'import ?
 *
 * `parSa` : la ligne portant CET identifiant, si elle existe.
 * `parEmail` : la ligne portant CETTE adresse, si elle existe.
 *
 * Les deux sont des lectures distinctes parce que ce sont deux
 * contraintes distinctes en base, et c'est justement leur désaccord qui
 * nous intéresse.
 */
export function actionPourLigne(args: {
  sa: string;
  email: string;
  parSa: { sa: string } | null;
  parEmail: { sa: string; email: string } | null;
}): ActionImport {
  const sa = String(args.sa ?? "").trim();
  const email = String(args.email ?? "").trim();
  if (!sa || !email) return { action: "refuser", raison: "email-pris-par-un-autre" };

  // L'identifiant a déjà sa ligne : rien à faire, on ne réécrit pas
  // quelqu'un qui travaille (email, nom, statut, code public).
  if (args.parSa) return { action: "deja-la", sa: args.parSa.sa };

  // Personne à cette adresse : c'est un nouvel affilié.
  if (!args.parEmail) return { action: "creer" };

  // L'adresse est prise. Par LUI ? Alors ses deux identifiants sont à
  // lui, et l'ancien doit continuer de le désigner.
  if (memePersonne(args.parEmail.email, email)) {
    return { action: "alias", vers: args.parEmail.sa };
  }

  // L'adresse est prise par quelqu'un d'AUTRE. On ne devine pas : un
  // alias mal posé envoie de l'argent au mauvais destinataire, et un
  // virement parti ne revient pas.
  return { action: "refuser", raison: "email-pris-par-un-autre" };
}
