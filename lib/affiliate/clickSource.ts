// lib/affiliate/clickSource.ts
//
// D'OÙ VIENT LE CLIC.
//
// Demande Béné du 19 août : "ajouter le tracking affilié : origine du
// clic (email, web, réseaux, youtube ...) + nombre de clics +
// commissions + taux de conversion."
//
// Deux informations, pas une, et la distinction compte :
//
//   - le CANAL est ÉCRIT par l'affilié (`youtube`, `newsletter`,
//     `story-mardi`). C'est lui qui compare ce qui marche, avec SES mots.
//   - la PROVENANCE est DÉDUITE du referrer. Elle existe même quand il
//     n'a rien taggé, donc personne ne se retrouve devant un écran
//     vide parce qu'il n'y a pas pensé.
//
// Ne garder que le canal donnerait des écrans vides à tous ceux qui ne
// taguent pas (l'immense majorité au début). Ne garder que la provenance
// empêcherait de distinguer deux vidéos YouTube. Les deux sont écrites
// sur chaque clic.

/** Les provenances qu'on sait nommer. `direct` = aucun referrer. */
export type ClickSource =
  | "youtube"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "pinterest"
  | "x"
  | "threads"
  | "reddit"
  | "email"
  | "search"
  | "web"
  | "direct";

/**
 * Domaines COMPLETS, comparés sur la frontière d'un nom d'hôte.
 *
 * Ce tableau existe pour les adresses courtes, et il a une raison
 * précise : un simple `includes` sur l'hôte est faux. `reddit.com`
 * CONTIENT `t.co` (redди**t.co**m), donc tout Reddit était compté comme
 * du trafic X. Le test l'a attrapé avant le déploiement, et c'est
 * exactement le genre d'erreur qu'on ne voit jamais en relisant.
 *
 * La comparaison est donc : hôte identique, ou hôte se terminant par
 * `.<domaine>`. Rien d'autre.
 */
const EXACT_DOMAINS: ReadonlyArray<readonly [string, ClickSource]> = [
  ["youtu.be", "youtube"],
  ["fb.me", "facebook"],
  ["lnkd.in", "linkedin"],
  ["pin.it", "pinterest"],
  ["t.co", "x"],
  ["x.com", "x"],
  ["ya.ru", "search"],
  ["laposte.net", "email"],
];

/**
 * Marques reconnues sur un SEGMENT du nom d'hôte.
 *
 * `pinterest` couvre pinterest.com, pinterest.fr et n'importe quel autre
 * suffixe, sans qu'on ait à les énumérer. Et comme la comparaison porte
 * sur un segment entier, aucun mot ne peut se cacher à l'intérieur
 * d'un autre.
 */
const LABELS: ReadonlyArray<readonly [string, ClickSource]> = [
  ["youtube", "youtube"],
  ["instagram", "instagram"],
  ["facebook", "facebook"],
  ["messenger", "facebook"],
  ["tiktok", "tiktok"],
  ["linkedin", "linkedin"],
  ["pinterest", "pinterest"],
  ["twitter", "x"],
  ["threads", "threads"],
  ["reddit", "reddit"],
  ["outlook", "email"],
  ["laposte", "email"],
  ["google", "search"],
  ["bing", "search"],
  ["duckduckgo", "search"],
  ["ecosia", "search"],
  ["qwant", "search"],
  ["yandex", "search"],
];

/**
 * Une boîte mail se reconnaît à sa PREMIÈRE tag.
 *
 * `mail.google.com` doit sortir en `email`, pas en `search` : une
 * newsletter ouverte dans Gmail n'est pas une recherche Google. Si cette
 * règle passait après les marques, tout le trafic des newsletters
 * basculerait dans les moteurs de recherche.
 */
const MAILBOX_PREFIXES = new Set(["mail", "webmail", "mails", "courrier"]);

/**
 * La provenance d'un clic, déduite du referrer.
 *
 * Fail-open assumé : un referrer illisible rend `web`, jamais `null`.
 * Une provenance approximative vaut mieux qu'une ligne vide dans un
 * tableau que l'affilié va lire.
 */
export function resolveClickSource(referrer: string | null | undefined): ClickSource {
  const brut = String(referrer ?? "").trim();
  if (!brut) return "direct";

  let hote: string;
  try {
    hote = new URL(brut).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "web";
  }
  if (!hote) return "web";

  const segments = hote.split(".");

  // 1. La boîte mail d'abord : `mail.google.com` est un email, pas une
  //    recherche. Cette règle DOIT passer avant les marques.
  if (MAILBOX_PREFIXES.has(segments[0])) return "email";

  // 2. Les domaines courts, sur la frontière d'un nom d'hôte.
  for (const [domaine, source] of EXACT_DOMAINS) {
    if (hote === domaine || hote.endsWith(`.${domaine}`)) return source;
  }

  // 3. Les marques, sur un segment entier : aucun mot ne peut se
  //    cacher à l'intérieur d'un autre.
  for (const [label, source] of LABELS) {
    if (segments.includes(label)) return source;
  }

  return "web";
}

/** Longueur maximale d'un tag de canal, côté base comme écran. */
export const CHANNEL_MAX_LENGTH = 24;

/**
 * Le tag de canal, mise en forme.
 *
 * Même nettoyage que le code affilié : elle finit dans une URL que
 * l'affilié dicte et recopie. Rend `null` (pas la chaîne vide) quand il
 * n'y a rien : la colonne est nullable, et `''` et `null` seraient deux
 * canaux différents dans un `group by`.
 */
export function sanitizeChannel(raw: string | null | undefined): string | null {
  const propre = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CHANNEL_MAX_LENGTH)
    .replace(/-+$/g, "");
  return propre || null;
}
