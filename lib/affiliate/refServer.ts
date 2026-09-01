// lib/affiliate/refServer.ts
//
// TOUTE AFFILIÉE A UN CODE, TOUJOURS.
//
// Béné, 24 août 2026 : "je ne veux surtout pas de sa dans les nouveaux
// liens sinon y'a forcément un moment où on va merder, trouver autre
// chose nom de zeus ! Y'a pas que ce système, c'est celui de systeme io
// c'est tout !!"
//
// Elle a raison, et le mot juste est "le leur". `sa` est l'identifiant
// que Systeme.io fabrique pour SES tunnels. Le garder dans nos liens
// mélangeait deux systèmes qui n'ont pas les mêmes règles, et rendait
// les deux générations de liens INDISCERNABLES une fois arrivées chez
// nous : on ne pouvait plus dire par où quelqu'un était passé.
//
// Nos liens portent donc `?ref=jocelyne`, le code public qui vit déjà
// dans `ref.ts` depuis le début du chantier. Effet de bord immédiat et
// décisif : **le nom du paramètre dit la génération du lien.** Plus
// besoin d'un marqueur pour réserver le mois offert au système courant,
// et donc plus de marqueur à oublier quelque part.
//
// -- POURQUOI CE FICHIER EXISTE ---------------------------------------
//
// Une affiliée inscrite avant le système de codes n'en a pas. Sans code,
// `buildAffiliateLink` n'aurait rien à écrire, et le repli évident (son
// `sa`) ramènerait exactement ce que Béné vient de refuser. On lui en
// FABRIQUE donc un, une fois, et il ne bouge plus.
//
// -- ET UN CODE ATTRIBUÉ NE CHANGE JAMAIS TOUT SEUL --------------------
//
// Elle peut le changer elle même (`/api/affiliate/ref`), et l'ancien
// continue de fonctionner pour toujours (`affiliate_ref_aliases`). Ce
// qui est interdit, c'est qu'un code se mette à désigner quelqu'un
// d'autre : ses liens vivent dans des vidéos déjà publiées.

import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { REF_MIN_LENGTH, sanitizeRef, shortCodeFrom, suggestRef } from "@/lib/affiliate/ref";
import { echapperMotifLike } from "@/lib/db/motifLike";

/** Le code est-il libre pour cette affiliée ? */
async function libre(ref: string, sa: string): Promise<boolean> {
  const { data: actuel } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .ilike("ref", echapperMotifLike(ref))
    .maybeSingle();
  if (actuel && (actuel as { sa: string }).sa !== sa) return false;

  // Un ancien code reste réservé à son propriétaire d'origine.
  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  if (alias && (alias as { sa: string }).sa !== sa) return false;

  return true;
}

/**
 * Le code public de cette affiliée, fabriqué s'il n'existe pas encore.
 *
 * Rend `null` UNIQUEMENT si la base est injoignable ou si l'écriture
 * échoue. L'appelant doit alors ne proposer AUCUN lien plutôt qu'un lien
 * qui n'attribuerait rien : un lien muet se partage, et chaque partage
 * est une vente perdue que personne ne peut plus retrouver.
 */
export async function assurerRefAffiliee(args: {
  sa: string;
  email: string;
  displayName?: string | null;
  /** Le code déjà connu, quand l'appelant vient de le lire. Évite un aller-retour. */
  refConnu?: string | null;
}): Promise<string | null> {
  const deja = sanitizeRef(args.refConnu);
  if (deja.length >= REF_MIN_LENGTH) return deja;

  const sa = String(args.sa ?? "").trim();
  if (!sa) return null;

  // Relit : l'appelant peut ne pas avoir la colonne sous la main.
  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("ref")
    .eq("sa", sa)
    .maybeSingle();
  if (error) {
    console.error(`[affiliate/ref] lecture impossible pour ${sa} : ${error.message}`);
    return null;
  }
  const enBase = sanitizeRef((data as { ref?: string | null } | null)?.ref);
  if (enBase.length >= REF_MIN_LENGTH) return enBase;

  // ── ON EN FABRIQUE UN ──
  //
  // Son prénom d'abord, puis la partie locale de son adresse : c'est ce
  // qu'elle reconnaîtra dans son propre lien. En dernier recours, un
  // code court tiré du `sa`, DÉTERMINISTE : deux appels concurrents (deux
  // onglets ouverts) doivent proposer le même, sinon on écrit deux codes
  // différents pour la même personne.
  const base = suggestRef(args.displayName, args.email);
  const octets = Array.from(sa).map((c) => c.charCodeAt(0));
  const candidats = [
    base,
    base ? `${base}-${shortCodeFrom(octets, 3)}` : "",
    `aff-${shortCodeFrom(octets, 6)}`,
    // Le dernier ne peut pas entrer en collision en pratique, mais s'il
    // le faisait on préfère ne rien écrire plutôt qu'écraser le code de
    // quelqu'un d'autre.
    `aff-${shortCodeFrom(octets.slice(3), 8)}`,
  ].map(sanitizeRef);

  for (const candidat of candidats) {
    if (candidat.length < REF_MIN_LENGTH) continue;
    if (!(await libre(candidat, sa))) continue;

    const { error: erreurEcriture } = await supabaseAdmin
      .from("affiliates")
      .update({ ref: candidat })
      .eq("sa", sa);
    if (erreurEcriture) {
      // Course perdue contre un autre onglet : quelqu'un a écrit avant
      // nous. On relit au lieu d'insister, et c'est SON code qui gagne.
      console.warn(`[affiliate/ref] ecriture refusee pour ${sa} : ${erreurEcriture.message}`);
      const { data: relu } = await supabaseAdmin
        .from("affiliates")
        .select("ref")
        .eq("sa", sa)
        .maybeSingle();
      const apres = sanitizeRef((relu as { ref?: string | null } | null)?.ref);
      return apres.length >= REF_MIN_LENGTH ? apres : null;
    }
    console.log(`[affiliate/ref] code attribue a ${sa} : ${candidat}`);
    return candidat;
  }

  console.error(`[affiliate/ref] aucun code libre pour ${sa} : aucun lien ne sera propose.`);
  return null;
}
