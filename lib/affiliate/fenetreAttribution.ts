// lib/affiliate/fenetreAttribution.ts
//
// COMBIEN DE TEMPS UN CONTACT RESTE RATTACHÉ À SON AFFILIÉ.
//
// Béné, 26 août 2026 : "s'il s'inscrit en free sur son lien : il reste
// son affilié à vie."
//
// -- POURQUOI CE FICHIER EXISTE ----------------------------------------
//
// La décision vivait dans `attribution.ts`, qui importe `supabaseAdmin`
// et exige donc des variables d'environnement au chargement : aucun test
// ne peut l'importer. C'est la règle du dépôt depuis le 1er août, et
// c'est littéralement là que les bugs s'installent (le verrou des
// webhooks, le 24 août, était dans ce cas exact).
//
// -- CE QUE `null` VEUT DIRE -------------------------------------------
//
// Aucune limite. Ce n'est pas un oubli : c'est la valeur qui dit "à
// vie", et elle est nommée pour qu'on ne la prenne pas pour un bug le
// jour où quelqu'un relira cette ligne.
//
// C'était 90 jours. Quelqu'un inscrit en gratuit via un lien affilié en
// janvier et qui passait payant en juin ne payait donc plus personne :
// l'affilié avait fait le travail (amener l'inscrit) et perdait la vente
// parce qu'elle avait mis six mois à mûrir.

/** `null` = à vie. Un nombre = une fenêtre en jours. */
export const ATTRIBUTION_WINDOW_DAYS: number | null = null;

/** Lisible par les tests et par les écrans, sans toucher à la base. */
export const ATTRIBUTION_A_VIE = ATTRIBUTION_WINDOW_DAYS === null;

/**
 * La date plancher d'une recherche de rattachement, ou `null` si elle
 * n'en a pas.
 *
 * `maintenant` est un PARAMÈTRE : un test qui dépend de l'horloge
 * clignote, et un test qui clignote finit désactivé.
 */
export function planchierRattachement(maintenant: number = Date.now()): string | null {
  if (ATTRIBUTION_WINDOW_DAYS === null) return null;
  return new Date(maintenant - ATTRIBUTION_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
}
