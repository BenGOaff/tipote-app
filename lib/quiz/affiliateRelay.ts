// lib/quiz/affiliateRelay.ts (Tipote, jumeau de Tiquiz)
//
// UN QUIZ PORTE L'AFFILIÉ QUI L'A PARTAGÉ (demande Maurice, 27 août 2026).
//
// Maurice met un quiz à disposition de ses affiliés. Aujourd'hui il
// DUPLIQUE le quiz une fois par affilié, pour savoir qui lui a amené
// quel contact. Un quiz par affilié, donc des statistiques éparpillées,
// une correction à reporter autant de fois qu'il a de partenaires, et
// un travail manuel à chaque nouvel arrivant.
//
// Il n'en faut qu'un. L'affilié colle son identifiant à la fin du lien
// du quiz, et c'est le quiz qui le transporte.
//
// -- LES DEUX MOITIÉS, ET ELLES NE FONT PAS LA MÊME CHOSE --------------
//
// 1. ÉTIQUETER LE LEAD : qui a amené ce contact. C'est ce qui remplit la
//    colonne "source" des statistiques, et ce qu'on écrit sur la fiche
//    contact du vendeur.
// 2. FAIRE PAYER LA COMMISSION : ça, c'est le système de vente du
//    vendeur, et il ne lit pas nos colonnes. Il lit SON cookie, posé
//    quand le visiteur atterrit sur SA page. D'où `attacherAffiliate` :
//    le bouton de fin de quiz emmène l'identifiant avec lui.
//
// En n'en faisant qu'une, on promet à un affilié un suivi qui s'affiche
// et une commission qui n'arrive pas.
//
// -- `sa` ET `ref` NE SE DEVINENT JAMAIS L'UN L'AUTRE ------------------
//
// `sa` est l'identifiant que Systeme.io fabrique pour SES tunnels ;
// `ref` est notre code public. Ils voyagent dans des champs séparés,
// comme partout ailleurs dans ces dépôts. Deviner à la forme marcherait
// aujourd'hui et casserait le jour où une affiliée choisit un code qui
// ressemble à un `sa`.
//
// On transporte les deux SANS CHOISIR : on ne sait pas vers quel système
// pointe le bouton de la créatrice, et chaque système ignore le
// paramètre qu'il ne connaît pas. Choisir à sa place, c'est se tromper
// une fois sur deux.

// -- LES LECTEURS, ET POURQUOI ILS SONT ÉCRITS ICI ---------------------
//
// Tipote a `isValidRef` (le format d'un code public) mais pas
// d'équivalent de `readSa` : le `sa` y voyage dans les webhooks, jamais
// lu depuis une URL publique. Les deux lecteurs ci-dessous s'appuient
// donc sur la règle EXISTANTE quand elle existe, et ne la réécrivent
// jamais : un code accepté d'un côté et refusé de l'autre, c'est un
// affilié qui n'est jamais payé, sans le moindre symptôme.

import { isValidRef, sanitizeRef } from "@/lib/affiliate/ref";
import { lireSa } from "@/lib/affiliate/saFormat";

export const REF_PARAM = "ref";
export const SA_PARAM = "sa";
export const CANAL_PARAM = "c";

// Le format du `sa` n'est écrit qu'à UN endroit dans ce dépôt
// (`lib/affiliate/saFormat.ts`), et un test interdit d'en recopier la
// regex : le jour où Systeme.io allonge ses identifiants, quatre
// endroits l'acceptent et le cinquième le refuse, et une commission se
// perd là où personne ne regarde.
const readSa = lireSa;

function readRef(valeur: unknown): string | null {
  // ON VALIDE, ON NE NORMALISE PAS. `sanitizeRef` est fait pour une
  // SAISIE À LA MAIN : il transforme "Jocelyne Dupré" en
  // `jocelyne-dupre`, ce qu'elle attend en tapant son code.
  //
  // Sur une URL publique, ce serait un bug d'attribution : `?ref=A B C`
  // deviendrait `a-b-c`, et créditerait un affilié qui s'appelle
  // vraiment `a-b-c` et qui n'a rien fait. Le lien est fabriqué par
  // `buildAffiliateLink`, donc un code propre ; ce qui n'a pas la
  // bonne forme n'a pas à être deviné.
  //
  // Seuls le blanc autour et la casse sont retirés : ça ne réécrit
  // aucun code, et c'est exactement ce que fait `readRef` côté Tiquiz.
  // Deux jumeaux qui n'acceptent pas les mêmes valeurs, c'est une
  // affiliée payée d'un côté et pas de l'autre, sans le moindre
  // symptôme.
  const propre = String(valeur ?? "").trim().toLowerCase();
  // Déjà canonique : `sanitizeRef` ne doit RIEN avoir à y changer.
  // C'est ce qui refuse `A B C` sans avoir à recopier une regex de
  // format, et donc sans créer la divergence qu'on veut éviter.
  if (sanitizeRef(propre) !== propre) return null;
  return isValidRef(propre) ? propre : null;
}

/** Ce qu'on accepte de transporter comme canal. */
function lireCanalBrut(valeur: string | null | undefined): string | null {
  const brut = String(valeur ?? "").trim().slice(0, 40);
  return brut || null;
}

/** Ce que le lien du quiz portait. Chaque champ peut manquer. */
export interface AffiliateDuQuiz {
  /** L'identifiant Systeme.io de l'affilié du vendeur. */
  sa: string | null;
  /** Notre code public. */
  ref: string | null;
  /** `?c=youtube` : l'étiquette que l'affilié pose lui même. */
  canal: string | null;
}

export const AFFILIATE_VIDE: AffiliateDuQuiz = { sa: null, ref: null, canal: null };

/**
 * Lit l'affilié dans la query d'une URL de quiz.
 *
 * PURE. Ne jette jamais : la valeur vient d'une URL publique, donc de
 * n'importe où. Les formats sont ceux de `readSa` / `readRef`, JAMAIS
 * réécrits ici : un code accepté à un endroit et refusé à un autre,
 * c'est un affilié qui n'est jamais payé, sans le moindre symptôme.
 */
export function lireAffiliateDuQuiz(
  search: string | URLSearchParams | null | undefined,
): AffiliateDuQuiz {
  if (!search) return AFFILIATE_VIDE;
  let params: URLSearchParams;
  try {
    params = typeof search === "string" ? new URLSearchParams(search) : search;
  } catch {
    return AFFILIATE_VIDE;
  }
  return {
    sa: readSa(params.get(SA_PARAM)),
    ref: readRef(params.get(REF_PARAM)),
    canal: lireCanalBrut(params.get(CANAL_PARAM)),
  };
}

/** Rien à transporter : le visiteur est venu de lui même. */
export function affiliateAbsent(a: AffiliateDuQuiz | null | undefined): boolean {
  return !a || (!a.sa && !a.ref);
}

/**
 * Recolle l'affilié sur un lien qui SORT du quiz.
 *
 * C'est la moitié qui PAIE : le visiteur atterrit sur la page de vente
 * avec l'identifiant, le système du vendeur pose son cookie, et la vente
 * lui est attribuée.
 *
 * TROIS REFUS, et chacun a coûté quelque chose quelque part :
 *
 * - un schéma qui n'est ni http ni https est rendu TEL QUEL. `mailto:`
 *   et `tel:` n'ont pas de query, et `javascript:` ne doit jamais être
 *   manipulé : y coller un paramètre reviendrait à fabriquer du code.
 * - un paramètre DÉJÀ présent n'est jamais remplacé. Si la créatrice a
 *   écrit son propre `?sa=` dans son bouton, c'est le sien qui compte :
 *   c'est son lien, pas le nôtre.
 * - une URL illisible est rendue telle quelle. Un bouton qui mène
 *   quelque part vaut mieux qu'un bouton mort.
 */
export function attacherAffiliate(
  url: string | null | undefined,
  a: AffiliateDuQuiz | null | undefined,
): string {
  const brut = String(url ?? "").trim();
  if (!brut || affiliateAbsent(a)) return brut;

  // Un schéma non http(s) explicite : on ne touche à rien.
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(brut)?.[1]?.toLowerCase();
  if (schema && schema !== "http" && schema !== "https") return brut;

  // `base` sert uniquement à parser un chemin relatif ; elle ne ressort
  // jamais, on rend la même forme (relative ou absolue) qu'on a reçue.
  const BASE = "https://exemple.invalid";
  let u: URL;
  try {
    u = new URL(brut, BASE);
  } catch {
    return brut;
  }

  const poser = (cle: string, valeur: string | null) => {
    if (!valeur) return;
    if (u.searchParams.has(cle)) return;
    u.searchParams.set(cle, valeur);
  };
  poser(SA_PARAM, a!.sa);
  poser(REF_PARAM, a!.ref);

  const absolue = !!schema || brut.startsWith("//");
  return absolue ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
}

/**
 * Relit un affilié mis de côté pendant la visite (sessionStorage).
 *
 * PURE. Repasse par les MÊMES lecteurs que l'URL : sans ça, un champ
 * enregistré à `null` revient en chaîne `"null"`, qui a exactement la
 * forme d'un code public valide (quatre lettres minuscules). On
 * attribuerait alors les leads à un affilié nommé "null", et personne
 * ne verrait rien avant de chercher pourquoi un versement part dans le
 * vide.
 */
export function lireAffiliateEnregistre(brut: string | null | undefined): AffiliateDuQuiz {
  if (!brut) return AFFILIATE_VIDE;
  try {
    return lireAffiliateObjet(JSON.parse(String(brut)));
  } catch {
    return AFFILIATE_VIDE;
  }
}

/**
 * Relit un affilié reçu dans un corps de requête.
 *
 * PURE. Le serveur ne fait JAMAIS confiance à ce que le navigateur lui
 * envoie : ces valeurs finissent dans une colonne et sur la fiche
 * contact du vendeur, donc elles repassent par les mêmes lecteurs que
 * l'URL, exactement comme au premier passage.
 */
export function lireAffiliateObjet(valeur: unknown): AffiliateDuQuiz {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return AFFILIATE_VIDE;
  const objet = valeur as Record<string, unknown>;
  return {
    sa: readSa(objet.sa),
    ref: readRef(objet.ref),
    canal: lireCanalBrut(typeof objet.canal === "string" ? objet.canal : null),
  };
}

/**
 * L'étiquette montrée dans les statistiques du quiz.
 *
 * Le canal passe DEVANT le code : quand l'affilié a pris la peine
 * d'écrire `?c=youtube`, c'est cette réponse là qu'il est venu chercher.
 * Sans rien, on dit "sans affilié" plutôt que de laisser une case vide,
 * qui se lit comme une donnée manquante alors que c'est une information.
 */
export function etiquetteSource(
  a: AffiliateDuQuiz | null | undefined,
  sansAffilie: string,
): string {
  if (!a) return sansAffilie;
  if (a.canal) return a.canal;
  return a.ref || a.sa || sansAffilie;
}
