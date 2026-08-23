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

export type AffiliateMarket = "fr" | "en";

/**
 * LE MARQUEUR DU SYSTÈME D'AFFILIATION COURANT.
 *
 * Béné, 23 août 2026, sur le mois offert : "uniquement avec le système
 * d'affiliation en cours et pas sur les anciens liens systeme io (qui
 * restent valides mais ne seront plus ceux à utiliser dans le futur)".
 *
 * Le `?sa=` ne peut pas porter cette information : un ancien lien
 * Systeme.io et un lien fabriqué ici portent le MÊME identifiant, avec
 * la même forme et le même propriétaire. Une fois arrivés sur nos
 * pages, ils sont indiscernables.
 *
 * D'où ce paramètre, ajouté ICI et nulle part ailleurs : tout ce que
 * l'espace affilié fabrique aujourd'hui le porte, tout ce qui a été
 * copié dans Systeme.io avant ne le portera jamais. Les anciens liens
 * commissionnent exactement comme avant : c'est le CADEAU qui est
 * réservé, pas la vente.
 *
 * Le lecteur est côté Tiquiz (`lib/affiliate/moisOffertLien.ts`), qui
 * le range dans un cookie `httpOnly` au passage du visiteur.
 */
export const AFFILIATE_LINK_MARKER = "mo=1";

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
 * puis on ajoute `?sa=` (ou `&sa=` si la query existe déjà).
 */
export function buildAffiliateLink(locale: string | null | undefined, path: string, sa: string): string {
  const p = (path ?? "").trim();
  let abs: string;
  if (/^https?:\/\//i.test(p)) {
    abs = p;
  } else {
    const origin = affiliateOrigin(locale);
    abs = p ? `${origin}${p.startsWith("/") ? "" : "/"}${p}` : `${origin}/`;
  }
  const avecSa = `${abs}${abs.includes("?") ? "&" : "?"}sa=${sa}`;
  return `${avecSa}&${AFFILIATE_LINK_MARKER}`;
}
