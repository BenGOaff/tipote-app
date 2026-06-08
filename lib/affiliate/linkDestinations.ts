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
  | "tiquiz_main"
  | "tiquiz_free"
  | "tiquiz_monthly"
  | "tiquiz_monthly_plus"
  | "tiquiz_yearly"
  | "tiquiz_yearly_plus";

export type LinkDestinationRow = {
  slug: LinkDestinationSlug;
  path: string;
  sort_order: number;
  enabled: boolean;
};

// Tipote n'est PAS en vente (Bene 8 juin 2026) : on ne propose AUCUN
// lien Tipote aux affilies. Uniquement les destinations Tiquiz.
const FALLBACK: LinkDestinationRow[] = [
  { slug: "tiquiz_main",         path: "/part-tiquiz",               sort_order: 10, enabled: true },
  { slug: "tiquiz_free",         path: "/part-tiquiz-gratuit",       sort_order: 20, enabled: true },
  { slug: "tiquiz_monthly",      path: "/part-tiquiz-mensuel",       sort_order: 30, enabled: true },
  { slug: "tiquiz_monthly_plus", path: "/tiquiz-mensuel-plus-part",  sort_order: 40, enabled: true },
  { slug: "tiquiz_yearly",       path: "/part-tiquiz-annuel",        sort_order: 50, enabled: true },
  { slug: "tiquiz_yearly_plus",  path: "/tiquiz-annuel-plus-part",   sort_order: 60, enabled: true },
];

/** Lit toutes les destinations (toutes lignes, y compris désactivées —
 *  l'admin a besoin de voir les desactivees pour les ressusciter). En
 *  cas d'echec DB (table absente, RLS), fallback hard-coded. */
export async function getAllLinkDestinations(): Promise<LinkDestinationRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("affiliate_link_destinations")
      .select("slug, path, sort_order, enabled")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK;
    return data as LinkDestinationRow[];
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
