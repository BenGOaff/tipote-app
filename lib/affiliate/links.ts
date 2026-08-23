// lib/affiliate/links.ts
//
// Construction des liens d'affiliation selon la langue de l'affilié.
//
// Tipote a un site par marché : le marché francophone vit sur tipote.fr,
// le marché anglophone sur tipote.blog (même arborescence de chemins). On
// montre donc à chaque affilié les liens de SON marché — un affilié EN
// partage tipote.blog, un FR partage tipote.fr — tout en gardant le même
// `?sa=` de tracking.
//
// Source de vérité = la langue d'INTERFACE de l'affilié (session.locale).
// Tout marché non-anglophone retombe sur tipote.fr (marché par défaut).
//
// -- NOS LIENS PORTENT `?ref=`, PLUS JAMAIS `?sa=` (24 août 2026) ------
//
// Béné : "je ne veux surtout pas de sa dans les nouveaux liens sinon
// y'a forcément un moment où on va merder, trouver autre chose nom de
// zeus ! Y'a pas que ce système, c'est celui de systeme io c'est tout !!"
//
// `sa` est l'identifiant que Systeme.io fabrique pour SES tunnels. Le
// reprendre dans nos liens mélangeait deux systèmes qui n'ont pas les
// mêmes règles, et rendait les deux générations de liens
// INDISCERNABLES une fois arrivées chez nous : même forme, même
// propriétaire, impossible de dire par où quelqu'un était passé.
//
// Le code public (`?ref=jocelyne`, cf. `ref.ts`) règle les deux
// problèmes d'un coup. Il se dicte au téléphone, il tient dans une bio
// Instagram, et **le nom du paramètre dit à lui seul la génération du
// lien**. C'est ce qui a permis de supprimer le marqueur `mo=1` :
// un lien `?ref=` est forcément un lien d'ici, un lien `?sa=` est
// forcément un ancien lien Systeme.io.
//
// Les anciens liens restent valides et continuent de commissionner :
// Tiquiz lit encore `?sa=` en entrée. Ce qui change, c'est ce que NOUS
// fabriquons.

export type AffiliateMarket = "fr" | "en";

/**
 * LE NOM DU PARAMÈTRE DANS NOS LIENS.
 *
 * Écrit une seule fois, et lu tel quel par le middleware de Tiquiz.
 * Deux chaînes séparées pour le même nom finiraient par diverger, et le
 * jour où elles divergent plus personne n'est payé.
 */
export const AFFILIATE_LINK_PARAM = "ref";

const DOMAINS: Record<AffiliateMarket, string> = {
  fr: "https://www.tipote.fr",
  en: "https://www.tipote.blog",
};

/** Marché (donc domaine) à servir pour une locale d'interface. EN → tipote.blog,
 *  tout le reste → tipote.fr (marché francophone par défaut). */
export function affiliateMarket(locale?: string | null): AffiliateMarket {
  return locale?.slice(0, 2).toLowerCase() === "en" ? "en" : "fr";
}

/** Domaine (origin, sans slash final) du marché de l'affilié. */
export function affiliateOrigin(locale?: string | null): string {
  return DOMAINS[affiliateMarket(locale)];
}

/**
 * Construit un lien d'affiliation complet à partir d'un chemin OU d'une URL.
 * - chemin relatif ("/commande", "tiquiz/affiliation", "") → préfixé du domaine
 *   du marché de l'affilié ;
 * - URL absolue (https://…) → laissée telle quelle (l'affilié a choisi sa cible) ;
 * puis on ajoute `?ref=` (ou `&ref=` si la query existe déjà).
 *
 * `ref` est le CODE PUBLIC de l'affiliée, jamais son `sa` : cf. le bloc
 * en tête de fichier.
 */
export function buildAffiliateLink(
  locale: string | null | undefined,
  path: string,
  ref: string,
): string {
  const p = (path ?? "").trim();
  let abs: string;
  if (/^https?:\/\//i.test(p)) {
    abs = p;
  } else {
    const origin = affiliateOrigin(locale);
    abs = p ? `${origin}${p.startsWith("/") ? "" : "/"}${p}` : `${origin}/`;
  }
  return `${abs}${abs.includes("?") ? "&" : "?"}${AFFILIATE_LINK_PARAM}=${encodeURIComponent(ref)}`;
}
