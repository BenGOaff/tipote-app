// lib/affiliate/conversionStore.ts
//
// LA LECTURE du rattachement d'une personne, alias compris. Aucune
// décision ici : le motif et le choix vivent dans `aliasAdresse.ts`, pur
// et testé. Ce fichier importe `supabaseAdmin`, donc aucun test ne peut
// le charger : c'est exactement pour ça qu'il ne décide rien.
//
// Deux lecteurs l'appellent, et il n'y en a qu'un exprès :
//   - `attributeSale` (la commission) ;
//   - `POST /api/affiliate/rattacher` (le premier rattachement gagne).
// Deux requêtes écrites séparément finiraient par ne plus reconnaître
// les mêmes alias, et c'est celle de la commission qui perdrait.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { motifAliasAdresse, premiereLigneDeLaPersonne } from "@/lib/affiliate/aliasAdresse";
import { planchierRattachement } from "@/lib/affiliate/fenetreAttribution";

type Conversion = { id: string; sa: string; email: string };

// UNE trace par processus quand la base ACCEPTE le motif. Sans elle, un
// `grep -c "refusee"` qui rend 0 ne distingue pas "la base a accepte" de
// "personne n'a encore achete", et un controle qui ne distingue pas ce
// qu'il est cense distinguer est pire qu'un controle absent (22 aout).
let aliasAccepteDit = false;

/**
 * Le rattachement le plus ANCIEN de cette personne, toutes formes de son
 * adresse confondues. `null` quand elle n'en a pas, ou quand la base n'a
 * pas pu être lue (c'est journalisé, jamais avalé).
 */
export async function premiereConversionDeLaPersonne(
  email: string,
): Promise<{ id: string; sa: string } | null> {
  const exact = email.trim().toLowerCase();
  if (!exact) return null;
  const plancher = planchierRattachement();
  const motif = motifAliasAdresse(exact);

  if (motif) {
    // `imatch` est le `~*` de Postgres : le motif ne reconnaît que les
    // formes de la même boîte. On lit quelques lignes et on laisse le
    // module pur trancher, au cas où la base en rendrait une de trop.
    let requete = supabaseAdmin
      .from("affiliate_conversions")
      .select("id, sa, email")
      .filter("email", "imatch", motif);
    if (plancher) requete = requete.gte("created_at", plancher);
    const { data, error } = await requete.order("created_at", { ascending: true }).limit(10);
    if (!error) {
      if (!aliasAccepteDit) {
        aliasAccepteDit = true;
        console.log("[affiliate/conversion] la recherche par alias est acceptee par la base.");
      }
      const ligne = premiereLigneDeLaPersonne((data ?? []) as Conversion[], exact);
      return ligne ? { id: ligne.id, sa: ligne.sa } : null;
    }
    // La base a refusé le motif (un PostgREST qui ne connaîtrait pas
    // `imatch`, une expression qu'il n'a pas su lire). On le CRIE, et on
    // retombe sur la lecture exacte d'avant le 12 septembre : moins
    // large, jamais plus fausse. Se taire ici perdrait des affiliés
    // sans qu'un seul écran le dise.
    console.error(
      `[affiliate/conversion] la recherche par alias a ete refusee (${error.message}) : repli sur l'adresse exacte pour ${exact}`,
    );
  }

  let requete = supabaseAdmin
    .from("affiliate_conversions")
    .select("id, sa, email")
    .eq("email", exact);
  if (plancher) requete = requete.gte("created_at", plancher);
  const { data, error } = await requete.order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    console.error("[affiliate/conversion] lecture du rattachement en erreur :", error.message);
    return null;
  }
  const ligne = data as Conversion | null;
  return ligne ? { id: ligne.id, sa: ligne.sa } : null;
}
