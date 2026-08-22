// lib/affiliate/ref.ts
//
// LE CODE PUBLIC D'UN AFFILIÉ.
//
// `?ref=jocelyne` au lieu de `?sa=sa00168442b3f...`. Ce n'est pas de la
// cosmétique : un lien se dicte au téléphone, se met dans une bio
// Instagram et se lit dans une vidéo. Un hash de 40 caractères, non.
//
// -- CE QUI EST RÉSERVÉ, ET CE QUI NE L'EST PAS ------------------------
//
// Seuls NOS propres chemins sont interdits. La leçon des slugs publics
// du 4 août ("on ne peut pas blacklister le mot quiz, beaucoup vont
// l'utiliser, c'est LOGIQUE") vaut ici mot pour mot : une liste
// d'interdits qui grossit finit par interdire les mots que les gens
// veulent vraiment. On n'interdit donc que ce qui produirait une
// ambiguïté de routage réelle.
//
// -- UN ANCIEN CODE NE MEURT JAMAIS ------------------------------------
//
// Si Jocelyne change son code, l'ancien continue de rediriger et de LUI
// attribuer les ventes, pour toujours (table `affiliate_ref_aliases`).
// Elle a des liens dans des vidéos déjà publiées : un code libéré puis
// réattribué volerait son trafic à quelqu'un d'autre. C'est pour ça
// qu'un code retiré reste indisponible pour tout le monde sauf son
// propriétaire d'origine.

/** Longueurs : assez court pour se dicter, assez long pour être un nom. */
export const REF_MIN_LENGTH = 3;
export const REF_MAX_LENGTH = 20;

/**
 * Les seuls mots interdits : ceux qui sont DÉJÀ des chemins à nous sur
 * le domaine affilié. Un code qui vaudrait "go" rendrait
 * `/go/go/atelier` ambigu.
 *
 * Ne PAS rallonger cette liste avec des mots "de marque" ou des noms de
 * pages futures : la porte du routage les couvre déjà, et chaque ajout
 * retire un prénom ou un nom de marque à quelqu'un.
 */
export const REF_RESERVED = new Set([
  "go",
  "j",
  "api",
  "admin",
  "_next",
  "auth",
  "login",
  "signup",
]);

export type RefError = "empty" | "too_short" | "too_long" | "charset" | "reserved";

/**
 * Met un code saisi à la main dans sa forme canonique.
 *
 * Minuscules, accents retirés, espaces et soulignés convertis en tirets,
 * tirets de tête, de queue et doublés supprimés. Quelqu'un qui tape
 * "Jocelyne Dupré" obtient `jocelyne-dupre`, ce qu'elle attend.
 */
export function sanitizeRef(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, REF_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Pourquoi ce code est refusé, ou `null` s'il est bon.
 *
 * On renvoie une RAISON, jamais une phrase : l'espace affilié existe en
 * plusieurs langues, c'est l'interface qui sait comment le dire (même
 * règle que la suppression d'un quiz et que l'import PDF).
 */
export function refError(raw: string | null | undefined): RefError | null {
  const brut = String(raw ?? "").trim();
  if (!brut) return "empty";

  // On juge la saisie AVANT nettoyage sur le jeu de caractères : sinon
  // "jocelyne@!!" passerait en silence sous le nom "jocelyne", et elle
  // ne comprendrait pas pourquoi son lien n'est pas celui qu'elle a tapé.
  if (!/^[a-zA-Z0-9\s_-]+$/.test(brut)) return "charset";

  const propre = sanitizeRef(brut);
  if (!propre) return "empty";
  if (propre.length < REF_MIN_LENGTH) return "too_short";
  if (brut.length > REF_MAX_LENGTH) return "too_long";
  if (REF_RESERVED.has(propre)) return "reserved";
  return null;
}

/** Ce code est-il utilisable comme lien public ? */
export function isValidRef(raw: string | null | undefined): boolean {
  return refError(raw) === null;
}

/**
 * Un code de repli, dérivé de ce qu'on connaît de l'affilié.
 *
 * Sert au moment où on donne un lien à quelqu'un qui n'en a pas encore
 * choisi. Jamais imposé : c'est une proposition, il peut la changer, et
 * l'ancienne restera valable.
 */
export function suggestRef(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const surNom = sanitizeRef(displayName);
  if (surNom.length >= REF_MIN_LENGTH && !REF_RESERVED.has(surNom)) return surNom;

  const local = String(email ?? "").split("@")[0];
  const surEmail = sanitizeRef(local);
  if (surEmail.length >= REF_MIN_LENGTH && !REF_RESERVED.has(surEmail)) return surEmail;

  return "";
}

/**
 * Le code court d'un lien.
 *
 * Alphabet sans les caractères qu'on confond à l'oral et à l'oeil
 * (0/O, 1/l/I) : un lien court se dicte encore plus souvent qu'un long.
 * L'unicité est garantie par la base (index unique), pas par ce tirage :
 * l'appelant réessaie si la ligne existe déjà.
 */
const SHORT_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function shortCodeFrom(bytes: readonly number[] | Uint8Array, length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const octet = Number(bytes[i] ?? 0);
    code += SHORT_ALPHABET[octet % SHORT_ALPHABET.length];
  }
  return code;
}
