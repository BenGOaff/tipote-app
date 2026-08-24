// lib/affiliate/linkDestinations.ts
//
// Source de vérité : table `affiliate_link_destinations` (1 row par
// slug, admin-editable depuis /affiliate/admin/links). Le code utilise
// les slugs comme clés stables ; le `path` est éditable par Béné sans
// commit. Drame 8 juin 2026 : avant cette refonte, /tiquiz/affiliation
// était codé en dur alors que la vraie URL est /part-tiquiz, et tous
// les affiliés perdaient leur commission sur le "lien principal".
//
// Fallback hard-coded ci-dessous = identique au seed de la migration
// 20260608_affiliate_link_destinations.sql. Sert UNIQUEMENT si la
// table n'a pas encore été créée en prod (avant migration).

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LinkDestinationSlug =
  | "tiquiz_direct"
  | "tiquiz_main"
  | "tiquiz_free"
  | "tiquiz_monthly"
  | "tiquiz_monthly_plus"
  | "tiquiz_yearly"
  | "tiquiz_yearly_plus"
  | "atelier";

export type LinkDestinationRow = {
  slug: LinkDestinationSlug;
  path: string;
  sort_order: number;
  enabled: boolean;
};

// Tipote n'est PAS en vente (Bene 8 juin 2026) : on ne propose AUCUN
// lien Tipote aux affilies. Uniquement les destinations Tiquiz et
// l'Atelier du Quiz (formation, commission 70%, uniquement FR : la page
// Promouvoir filtre ce slug hors marche FR).
//
// -- LES LIENS ATTERRISSENT SUR NOS DOMAINES (25 aout 2026) -----------
//
// Bene : "toutes, d'un bloc". Jusqu'ici 7 destinations sur 8 menaient a
// des tunnels Systeme.io, et leurs pages ne nous transmettent RIEN de ce
// qu'on ajoute a l'URL : un `?ref=` pose dessus n'atteignait jamais
// notre bon de commande, donc ni notre commissionnement ni le mois
// offert.
//
// **CE QU'ON N'A PAS PU REPRENDRE, ET POURQUOI.** Les pages `-mensuel`,
// `-annuel` et compagnie de Systeme.io ne sont PAS des pages de vente :
// ce sont leurs BONS DE COMMANDE. Verifie en les capturant le 25 aout :
// elles portent un `<form id="form-checkout">` sans action, pilote par
// leur JavaScript. Les repliquer chez nous donnerait un formulaire de
// paiement mort. On envoie donc sur NOTRE bon de commande, qui vend le
// meme palier, affiche le meme prix (il vient du catalogue) et propose
// les trois autres en bas.
//
// **`tiquiz_free` RESTE chez Systeme.io, et c'est deliberé.** C'est un
// optin, pas une vente : son formulaire cree le contact et pose le tag
// chez eux, et c'est le seul evenement qui porte une URL de tunnel, donc
// le seul qui sait d'ou vient l'inscrit. Le remplacer par notre `/signup`
// ferait disparaitre ces inscrits de ses sequences email. A refaire le
// jour ou notre inscription gratuite creera elle aussi le contact chez
// Systeme.io.
const FALLBACK: LinkDestinationRow[] = [
  { slug: "tiquiz_direct",       path: "https://tiquiz.fr/",                        sort_order: 8,  enabled: true },
  { slug: "atelier",             path: "https://atelierduquiz.fr/",                 sort_order: 5,  enabled: true },
  { slug: "tiquiz_main",         path: "https://tiquiz.fr/",                        sort_order: 10, enabled: true },
  // Le seul qui reste chez eux : voir le bloc ci-dessus.
  { slug: "tiquiz_free",         path: "/part-tiquiz-gratuit",                      sort_order: 20, enabled: true },
  { slug: "tiquiz_monthly",      path: "https://tiquiz.fr/commande/mensuel",        sort_order: 30, enabled: true },
  { slug: "tiquiz_monthly_plus", path: "https://tiquiz.fr/commande/mensuel-plus",   sort_order: 40, enabled: true },
  { slug: "tiquiz_yearly",       path: "https://tiquiz.fr/commande/annuel",         sort_order: 50, enabled: true },
  { slug: "tiquiz_yearly_plus",  path: "https://tiquiz.fr/commande/annuel-plus",    sort_order: 60, enabled: true },
];

/**
 * Toutes les destinations (y compris désactivées : l'admin a besoin de
 * les voir pour les ressusciter).
 *
 * -- UNE DESTINATION AJOUTÉE EN CODE N'EXIGE PLUS DE MIGRATION --------
 *
 * Les lignes de la BASE gagnent toujours, et les slugs du seed qu'elle
 * ne contient PAS ENCORE sont ajoutés par dessus. Sans ça, chaque
 * nouvelle destination demandait un `INSERT` à passer à la main, donc
 * une migration de plus à ne pas oublier : exactement la mécanique qui
 * a coûté 15 jours de statistiques en juin, et une journée entière le
 * 22 août.
 *
 * Ça ne ressuscite RIEN de désactivé : l'admin ne supprime jamais une
 * ligne, il pose `enabled = false` (cf. `app/affiliate/api/admin/links`).
 * Une destination éteinte a donc une ligne, elle n'est pas "manquante",
 * et le seed ne la recouvre pas.
 */
export async function getAllLinkDestinations(): Promise<LinkDestinationRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("affiliate_link_destinations")
      .select("slug, path, sort_order, enabled")
      .order("sort_order", { ascending: true });
    // Table absente ou vide : le seed EST la source. C'est le cas d'un
    // déploiement qui devance la migration, et l'écran doit marcher.
    if (error || !data || data.length === 0) return FALLBACK;

    const rows = data as LinkDestinationRow[];
    const connus = new Set(rows.map((r) => r.slug));
    const manquants = FALLBACK.filter((f) => !connus.has(f.slug));
    return [...rows, ...manquants].sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return FALLBACK;
  }
}

/** Lit uniquement les destinations actives, triees par sort_order.
 *  Utilise par la page Promouvoir cote affilie. */
export async function getActiveLinkDestinations(): Promise<LinkDestinationRow[]> {
  const all = await getAllLinkDestinations();
  return all.filter((r) => r.enabled);
}

/** Resout le path d'un slug donne. Utile pour les liens precis (ex.
 *  bandeau trial-tiquiz qui pointe vers la page de vente principale).
 *  Fallback sur FALLBACK si la table est vide. */
export async function getLinkPath(slug: LinkDestinationSlug): Promise<string> {
  const all = await getAllLinkDestinations();
  const row = all.find((r) => r.slug === slug);
  if (row) return row.path;
  const fb = FALLBACK.find((r) => r.slug === slug);
  return fb?.path ?? "/";
}
