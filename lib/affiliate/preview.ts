// lib/affiliate/preview.ts
//
// LA PORTE DU NOUVEAU PROGRAMME D'AFFILIATION.
//
// Demande Béné du 19 août : "mets ça sur une page non accessible aux
// affiliés et clients présents pour que je puisse tester sans qu'ils le
// voient." Sinon "il va y avoir un moment où ce sera tout bugué avec les
// mauvaises infos, des paiements impossibles".
//
// Elle a raison, et ça vaut pour toute la suite du chantier : la page de
// vente, le paiement, les codes promo. Tant que ce n'est pas fini, ça
// n'existe que pour elle.
//
// -- L'ABSENCE DE CONFIGURATION FERME, ELLE N'OUVRE PAS ----------------
//
// C'est LA règle de ce fichier, et elle vient du drame Véronique du
// 2 août : `process.env.X ?? valeurDefaut` ne protège que de la variable
// ABSENTE, jamais de la variable FAUSSE. Ici on inverse la charge :
// variable absente, vide ou illisible -> personne n'entre. Un `.env`
// oublié sur le serveur ne peut donc pas ouvrir un chantier en cours à
// toutes les affiliées.
//
// -- ET ON RÉPOND 404, PAS "ACCÈS REFUSÉ" ------------------------------
//
// Un refus explicite annonce qu'il y a quelque chose derrière. Une
// affiliée curieuse saurait qu'un écran existe et demanderait pourquoi
// elle n'y a pas droit. `notFound()` ne dit rien du tout.

/**
 * Les adresses autorisées, lues depuis `AFFILIATE_PREVIEW_EMAILS`
 * (séparées par des virgules).
 *
 * Exportée pour être testable sans toucher à l'environnement : la
 * fonction ne lit JAMAIS `process.env` elle-même, elle reçoit la valeur.
 */
export function parsePreviewEmails(raw: string | null | undefined): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

/**
 * Cette personne voit-elle le chantier en cours ?
 *
 * `email` est celui de la session affiliée. Aucune session, aucune
 * liste, une liste vide : c'est non.
 */
export function isPreviewViewer(
  email: string | null | undefined,
  allowList: string | null | undefined,
): boolean {
  const propre = String(email ?? "").trim().toLowerCase();
  if (!propre) return false;
  const autorises = parsePreviewEmails(allowList);
  if (autorises.size === 0) return false;
  return autorises.has(propre);
}

/**
 * La même chose, en lisant l'environnement du serveur.
 *
 * Point d'entrée unique côté serveur : personne d'autre ne lit
 * `AFFILIATE_PREVIEW_EMAILS`, pour la même raison que les URLs
 * canoniques ne sont écrites qu'à un endroit (drame de l'Atelier du
 * 3 août : une valeur lue à deux endroits ne se corrige qu'à moitié).
 */
export function canSeeAffiliatePreview(email: string | null | undefined): boolean {
  return isPreviewViewer(email, process.env.AFFILIATE_PREVIEW_EMAILS);
}
