// lib/dns/enregistrement.ts
//
// L'ENREGISTREMENT DNS QU'ON DEMANDE VRAIMENT (retour Béné, 29 août 2026).
//
// "Là il est paumé de chez paumé." Eric est chez OVH, il veut brancher
// son domaine, et l'écran lui demande de créer un CNAME dont le nom est
// `@`. OVH refuse, en rouge, avec la bonne raison :
//
//   "Un enregistrement CNAME ne peut pas être créé à la racine du
//    domaine (@). Vous pouvez utiliser le pointage SVCB."
//
// OVH a raison, et ce n'est pas une particularité OVH : à la racine
// d'une zone il y a déjà un SOA et des NS, et un CNAME ne peut pas
// cohabiter avec d'autres enregistrements (RFC 1912 section 2.4). AUCUN
// hébergeur correct ne l'acceptera. On lui demandait donc quelque chose
// d'IMPOSSIBLE, et il n'avait aucun moyen de le savoir.
//
// -- ET LE PLUS RAGEANT : LE SERVEUR SAVAIT DÉJÀ FAIRE ----------------
//
// `verifyDomainDns` vérifie le CNAME d'abord, PUIS l'adresse IP, avec
// ce commentaire écrit le 3 août : "l'IP le repli pour les domaines a
// l'apex qui ne PEUVENT pas porter de CNAME". Le contrôle acceptait
// donc parfaitement un enregistrement A à la racine. Seul l'ÉCRAN
// l'ignorait, et ne montrait qu'une voie : la seule qui ne marche pas
// là où il était.
//
// Encore une moitié de décision : deux endroits parlent de la même
// chose, un seul avait été corrigé.
//
// -- LA DEUXIÈME FAUTE, INVISIBLE EN FRANCE ---------------------------
//
// L'ancien découpage prenait les DEUX derniers labels comme racine.
// `quiz.mon-site.co.uk` donnait donc nom = `quiz.mon-site` et racine =
// `co.uk`. Le champ que la personne RECOPIE était faux, et
// `mon-site.co.uk` (une racine) était traité comme un sous-domaine.
// Tiquiz se vend en 7 langues : `.co.uk` et `.com.br` ne sont pas des
// cas d'école.
//
// PUR : aucune résolution DNS ici. La mesure vit dans
// customDomainsServer.ts, la décision d'affichage vit ici, et le test
// peut l'importer.

/** Ce qu'on demande de créer, dans les mots des champs à remplir. */
export interface EnregistrementDns {
  /** CNAME pour un sous-domaine, A pour une racine. */
  forme: "cname" | "a";
  /** Le champ "Nom" / "Sous-domaine". */
  nom: string;
  /** Le champ "Cible" / "Valeur". */
  cible: string;
  /** Le domaine à ouvrir chez son bureau d'enregistrement. */
  racine: string;
  /** L'hôte EST la racine : le CNAME y est interdit. */
  apex: boolean;
  /** Le sous-domaine qu'on propose à la place, sur une racine. */
  suggestion: string | null;
}

/**
 * Les deuxièmes niveaux qui font partie du suffixe, pas du domaine.
 *
 * Une règle plutôt qu'une liste de pays : sous un TLD de DEUX lettres
 * (donc un code pays), ces labels-là sont des rubriques ouvertes à
 * tous, jamais le nom de quelqu'un. Ça couvre `co.uk`, `com.au`,
 * `com.br`, `co.jp`, `ne.jp`, `com.mx`, `co.za`, `org.uk`, `co.nz`
 * sans liste de pays à tenir à jour.
 *
 * Limite assumée : un suffixe exotique non couvert retombe sur la règle
 * des deux derniers labels, c'est à dire le comportement d'avant. On ne
 * régresse nulle part, et on répare le gros du monde.
 */
const NIVEAUX_PUBLICS = new Set([
  "co", "com", "net", "org", "edu", "gov", "ac", "or", "ne", "go",
  "gob", "gouv", "asso", "nom", "tm", "mil", "sch", "in", "firm", "gen",
]);

/** L'hôte, coupé entre ce qui est à lui et ce qui est le suffixe. */
export function decouperHote(hostname: string): {
  nom: string;
  racine: string;
  apex: boolean;
} {
  const labels = String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);

  if (labels.length <= 2) {
    return { nom: "@", racine: labels.join("."), apex: true };
  }

  const tld = labels[labels.length - 1] ?? "";
  const avant = labels[labels.length - 2] ?? "";
  const tailleSuffixe = tld.length === 2 && NIVEAUX_PUBLICS.has(avant) ? 3 : 2;

  if (labels.length <= tailleSuffixe) {
    return { nom: "@", racine: labels.join("."), apex: true };
  }

  return {
    nom: labels.slice(0, -tailleSuffixe).join("."),
    racine: labels.slice(-tailleSuffixe).join("."),
    apex: false,
  };
}

/**
 * L'enregistrement à créer pour brancher cet hôte.
 *
 * LES DEUX CIBLES SONT DES PARAMÈTRES OBLIGATOIRES, jamais des
 * constantes lues ici : elles viennent de l'environnement du serveur
 * (`CUSTOM_DOMAIN_TARGET_CNAME`, `CUSTOM_DOMAIN_TARGET_IP`), et un
 * écran qui afficherait une valeur pendant que le contrôle en vérifie
 * une autre est exactement le bug du 3 août.
 */
export function enregistrementPour(
  hostname: string,
  cibles: { cname: string; ip: string },
): EnregistrementDns {
  const { nom, racine, apex } = decouperHote(hostname);

  if (apex) {
    // À la racine, le CNAME est REFUSÉ par l'hébergeur. On demande donc
    // l'enregistrement A, que le contrôle accepte déjà.
    //
    // Et on propose le sous-domaine, parce que c'est la meilleure
    // configuration et pas seulement la plus facile : un CNAME désigne
    // notre hôte par son NOM, donc il reste juste le jour où le serveur
    // change d'adresse. Une IP recopiée chez lui ne suivrait pas.
    return {
      forme: "a",
      nom: "@",
      cible: cibles.ip,
      racine,
      apex: true,
      suggestion: racine ? `quiz.${racine}` : null,
    };
  }

  return { forme: "cname", nom, cible: cibles.cname, racine, apex: false, suggestion: null };
}
