// lib/quiz/urlPublique.ts
//
// L'ADRESSE PUBLIQUE D'UN PROJET, CALCULÉE UNE SEULE FOIS.
//
// Elle dépend du domaine : sur le nôtre, le chemin porte un préfixe
// (`/q/mon-quiz`) ; sur le domaine personnalisé d'une créatrice, le slug
// est servi À LA RACINE (`exemple.fr/mon-quiz`, réécrit vers `/s/<slug>`
// par le middleware, cf. la note du 4 août).
//
// -- POURQUOI CE FICHIER EXISTE (1er septembre 2026) ------------------
//
// La règle vivait dans `hooks/useShareDomain.ts`, donc côté NAVIGATEUR
// seulement. Les générateurs, eux, tournent côté serveur et doivent
// mettre cette adresse dans des emails et des posts que la créatrice
// publiera. Une deuxième écriture de la règle aurait donné deux adresses
// pour le même quiz, et c'est celle du contenu généré qui serait partie
// dans une campagne : le défaut sorti six fois dans ce dépôt, mais cette
// fois il coûterait des visiteurs perdus sur un lien qui répond 404.
//
// Le hook appelle donc cette fonction, et le serveur aussi.

/**
 * L'adresse publique complète.
 *
 * `origine` est le domaine à employer, déjà résolu par l'appelant (le
 * navigateur connaît le sien, le serveur passe par `resolveAppUrl`).
 * `surDomainePerso` dit si cette origine est le domaine d'une créatrice :
 * c'est un PARAMÈTRE, jamais deviné à la forme de l'adresse. Deviner
 * marcherait aujourd'hui et casserait le jour où quelqu'un branche un
 * domaine qui ressemble au nôtre.
 */
export function urlPubliqueProjet(args: {
  origine: string;
  /**
   * Le préfixe de chemin sur notre domaine ("q" pour un quiz, "p" pour
   * une page). Un `string` et pas une union : Tipote sert plus de types
   * de contenu public que Tiquiz, et ce fichier est le MÊME des deux
   * côtés. Ce que la valeur peut valoir est la responsabilité de
   * l'appelant, qui a son propre type.
   */
  kind: string;
  segment: string;
  surDomainePerso: boolean;
  suffixe?: string;
}): string {
  const suffixe = args.suffixe ?? "";
  const origine = args.origine.replace(/\/$/, "");
  if (!origine) return `/${args.segment}${suffixe}`;
  return args.surDomainePerso
    ? `${origine}/${args.segment}${suffixe}`
    : `${origine}/${args.kind}/${args.segment}${suffixe}`;
}
