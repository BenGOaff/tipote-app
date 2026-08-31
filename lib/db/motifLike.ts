// lib/db/motifLike.ts
//
// UNE ADRESSE EMAIL N'EST PAS UN MOTIF DE RECHERCHE (31 août 2026).
//
// -- CE QUI A ÉTÉ TROUVÉ -----------------------------------------------
//
// Dix endroits, dans les trois dépôts, cherchaient un compte avec
// `.ilike("email", email)`. Or dans un LIKE Postgres, **`_` remplace
// n'importe quel caractère** et `%` n'importe quelle suite. Et `_` est
// parfaitement légal dans une adresse : `jean_dupont@gmail.com` est
// banal.
//
// `jean_dupont@gmail.com` cherché en ILIKE matche donc
// `jeanXdupont@gmail.com`, c'est à dire le compte de QUELQU'UN
// D'AUTRE. Les deux pires cas trouvés :
//
// - un `UPDATE profiles ... WHERE email ILIKE <adresse>` (le mois
//   offert) : sans `limit`, il écrit sur TOUTES les lignes qui
//   matchent, donc sur le profil d'un autre ;
// - la résolution de la session affiliée : soit elle rend la MAUVAISE
//   ligne (l'affilié voit le tableau de bord d'un autre), soit elle en
//   rend deux, `maybeSingle` échoue, et l'affilié n'a plus de session
//   du tout.
//
// -- POURQUOI ON ÉCHAPPE PLUTÔT QUE DE PASSER À `.eq` ------------------
//
// `.eq` serait plus simple, et il est sûr partout où la colonne ne
// contient que du minuscule. Mais certaines de ces tables sont
// alimentées par des imports Systeme.io dont la casse n'est pas
// garantie : passer à `.eq` risquerait d'empêcher une connexion, ce qui
// est PIRE que le bug qu'on corrige.
//
// Échapper ne change donc RIEN au comportement, sauf exactement le cas
// fautif : la casse reste ignorée, et `_` comme `%` redeviennent des
// caractères ordinaires.
//
// `\` est le caractère d'échappement par défaut de LIKE en Postgres.
// On échappe le `\` en PREMIER, sinon on échapperait les barres qu'on
// vient d'ajouter.

/**
 * Rend une valeur littérale dans un motif LIKE / ILIKE.
 *
 * À utiliser sur TOUTE valeur reçue de l'extérieur passée à `.like()`
 * ou `.ilike()`. Une vraie recherche (un admin qui tape un fragment)
 * n'appelle pas cette fonction : c'est le seul cas où les jokers sont
 * voulus, et il doit être explicite.
 */
export function echapperMotifLike(valeur: unknown): string {
  return String(valeur ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
