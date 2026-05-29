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
  return `${abs}${abs.includes("?") ? "&" : "?"}sa=${sa}`;
}
