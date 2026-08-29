// lib/affiliate/clicsParLien.ts
//
// COMBIEN DE CLICS, PAR LIEN, SANS PLAFOND ET SANS DEVINER.
//
// Ce module ne DÉCIDE rien : il lit et il compte. Toutes les décisions
// (le nom des lignes, l'ordre, ce qui est supprimable) vivent dans
// `mesLiens.ts`, qui est pur et testé. Ici on importe `supabaseAdmin`,
// donc aucun test ne peut importer ce fichier : raison de plus pour
// qu'il ne contienne aucune règle.
//
// -- POURQUOI UNE FONCTION SQL PLUTÔT QU'UNE LECTURE DE LIGNES ---------
//
// Compter côté application obligerait à borner la lecture, et un total
// borné est un total FAUX le jour où l'affiliée décolle. C'est
// exactement le genre de chiffre qu'on ne veut plus jamais afficher :
// elle prend des décisions dessus.
//
// -- ET SI LA MIGRATION N'EST PAS ENCORE PASSÉE ------------------------
//
// On retombe sur des `count` exacts, un par lien. C'est plus d'allers
// retours, mais le nombre de liens d'une affiliée se compte sur les
// doigts, et surtout le chiffre reste JUSTE. Seuls les visiteurs
// uniques manquent (ils exigent un `count(distinct)`), et l'écran
// affiche alors les clics seuls plutôt qu'un nombre inventé.

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ComptesClics {
  /** `link_id` -> clics. La clé vide porte les clics du lien de base. */
  clics: Map<string, number>;
  visiteurs: Map<string, number>;
  /** Les clics qui ne sont rattachés à aucun lien nommé. */
  horsLien: { clics: number; visiteurs: number };
  /** `false` quand les visiteurs uniques n'ont pas pu être calculés. */
  visiteursConnus: boolean;
}

const VIDE: ComptesClics = {
  clics: new Map(),
  visiteurs: new Map(),
  horsLien: { clics: 0, visiteurs: 0 },
  visiteursConnus: false,
};

/** Compte exact d'une table, sans rapatrier une seule ligne. */
async function combien(sa: string, linkId: string | null): Promise<number> {
  const requete = supabaseAdmin
    .from("affiliate_clicks")
    .select("id", { count: "exact", head: true })
    .eq("sa", sa);
  const { count, error } = await (linkId === null
    ? requete.is("link_id", null)
    : requete.eq("link_id", linkId));
  if (error) return 0;
  return Number(count) || 0;
}

/**
 * Les clics de cet affilié, par lien.
 *
 * Ne lève jamais : un écran de statistiques ne doit pas tomber parce
 * qu'une lecture a échoué. Il rend alors des compteurs vides, et
 * l'appelant affiche ce qu'il a.
 */
export async function lireClicsParLien(
  sa: string,
  idsDesLiens: readonly string[],
): Promise<ComptesClics> {
  try {
    const { data, error } = await supabaseAdmin.rpc("affiliate_clics_par_lien", { p_sa: sa });
    if (!error && Array.isArray(data)) {
      const clics = new Map<string, number>();
      const visiteurs = new Map<string, number>();
      let horsClics = 0;
      let horsVisiteurs = 0;
      for (const l of data as { link_id: string | null; clics: number; visiteurs: number }[]) {
        const id = String(l.link_id ?? "").trim();
        const c = Number(l.clics) || 0;
        const v = Number(l.visiteurs) || 0;
        if (!id) {
          horsClics += c;
          horsVisiteurs += v;
          continue;
        }
        clics.set(id, (clics.get(id) ?? 0) + c);
        visiteurs.set(id, (visiteurs.get(id) ?? 0) + v);
      }
      return {
        clics,
        visiteurs,
        horsLien: { clics: horsClics, visiteurs: horsVisiteurs },
        visiteursConnus: true,
      };
    }
  } catch {
    // La fonction n'existe pas encore : on compte autrement.
  }

  try {
    const clics = new Map<string, number>();
    for (const id of idsDesLiens) {
      clics.set(id, await combien(sa, id));
    }
    return {
      clics,
      visiteurs: new Map(),
      horsLien: { clics: await combien(sa, null), visiteurs: 0 },
      visiteursConnus: false,
    };
  } catch {
    return VIDE;
  }
}
