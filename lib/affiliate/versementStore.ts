// lib/affiliate/versementStore.ts
//
// LIRE ET ÉCRIRE. AUCUNE DÉCISION ICI.
//
// Tout ce qui se décide (qui est payable, ce qui manque, ce qui entre
// dans le lot, le contenu du fichier) vit dans `coordonnees.ts`,
// `versement.ts` et `sepa.ts`, qui n'importent rien et se testent. Ce
// fichier importe `supabaseAdmin`, donc il exige des variables
// d'environnement au chargement, donc aucun test ne peut l'importer :
// c'est exactement pour ça qu'il ne doit rien décider.
//
// (Leçon du verrou des webhooks, 24 août : la décision était enfermée
// dans le module qui parle à la base, et c'est littéralement là que le
// bug s'était installé.)

import "server-only";

import {
  lireCoordonnees,
  masquerIban,
  peutEtrePayee,
  resoudreMethode,
  type Coordonnees,
  type MethodeVersement,
} from "@/lib/affiliate/coordonnees";
import {
  commissionApprouvable,
  construireLot,
  type AffilieePayable,
  type CommissionAVerser,
  type Lot,
} from "@/lib/affiliate/versement";
import { decryptField, encryptField, generateDEK, unwrapDEK, wrapDEK } from "@/lib/piiCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TABLE_AFF = "affiliates";
const TABLE_COMM = "affiliate_commissions";
const TABLE_LOTS = "affiliate_payouts";

const CHAMPS_AFF =
  "sa, email, display_name, payout_method, paypal_email, iban_holder, iban_chiffre, iban_masque, pii_dek, bic";

interface LigneAffiliee {
  sa: string;
  email: string;
  display_name: string | null;
  payout_method: string | null;
  paypal_email: string | null;
  iban_holder: string | null;
  iban_chiffre: string | null;
  iban_masque: string | null;
  pii_dek: string | null;
  bic: string | null;
}

/**
 * L'IBAN EN CLAIR, et il ne sort d'ici que pour le fichier SEPA.
 *
 * Aucune route ne le renvoie à un navigateur, pas même à sa
 * propriétaire : c'est `iban_masque` qui s'affiche. Le déchiffrement
 * n'a lieu qu'au moment de construire le lot.
 */
function dechiffrerIban(ligne: LigneAffiliee): string | null {
  if (!ligne.iban_chiffre || !ligne.pii_dek) return null;
  try {
    return decryptField(ligne.iban_chiffre, unwrapDEK(ligne.pii_dek));
  } catch (e) {
    // Une clé illisible n'est pas un plantage : c'est une affiliée qu'on
    // ne peut pas payer ce mois ci, et qui doit ressaisir. Le lot
    // l'écartera en le DISANT.
    console.error(`[versement] IBAN illisible pour ${ligne.sa} : ${(e as Error).message}`);
    return null;
  }
}

/** Ce qu'une affiliée voit de ses propres coordonnées. Jamais l'IBAN. */
export interface CoordonneesAffichables {
  methode: MethodeVersement | null;
  /** Explicite = elle a vraiment choisi. Sinon l'écran redemande. */
  choixExplicite: boolean;
  paypalEmail: string | null;
  titulaire: string | null;
  ibanMasque: string | null;
  bic: string | null;
  complet: boolean;
  majLe: string | null;
}

export async function lireCoordonneesAffiliee(sa: string): Promise<CoordonneesAffichables | null> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE_AFF)
      .select(`${CHAMPS_AFF}, coordonnees_maj_le`)
      .eq("sa", sa)
      .maybeSingle();
    if (!data) return null;
    const l = data as LigneAffiliee & { coordonnees_maj_le: string | null };
    // On juge sur l'IBAN DÉCHIFFRÉ : un masque ne dit pas si la clé de
    // contrôle passe, et afficher "tout est bon" sur un IBAN illisible
    // serait un virement rejeté que personne n'attend.
    const c = lireCoordonnees({
      payout_method: l.payout_method,
      paypal_email: l.paypal_email,
      iban_holder: l.iban_holder,
      iban_number: dechiffrerIban(l),
      bic: l.bic,
    });
    return {
      methode: c.methode,
      choixExplicite: resoudreMethode({ payout_method: l.payout_method }).explicite,
      paypalEmail: l.paypal_email,
      titulaire: l.iban_holder,
      ibanMasque: l.iban_masque,
      bic: l.bic,
      complet: peutEtrePayee(c),
      majLe: l.coordonnees_maj_le,
    };
  } catch (e) {
    console.error(`[versement] lecture coordonnees impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * Enregistre le choix et les coordonnées.
 *
 * L'IBAN est chiffré ICI, jamais stocké en clair. La clé de l'affiliée
 * est créée au premier enregistrement et réutilisée ensuite : en
 * regénérer une à chaque écriture rendrait l'ancien chiffré illisible.
 */
export async function ecrireCoordonneesAffiliee(args: {
  sa: string;
  methode: MethodeVersement;
  paypalEmail?: string | null;
  titulaire?: string | null;
  /** En clair, tel que saisi. Chiffré avant écriture. */
  iban?: string | null;
  bic?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE_AFF).select("pii_dek").eq("sa", args.sa).maybeSingle();
    if (!data) return { ok: false, reason: "affiliee_inconnue" };

    let dekEnveloppe = (data as { pii_dek: string | null }).pii_dek;
    if (!dekEnveloppe) dekEnveloppe = wrapDEK(generateDEK());
    const dek = unwrapDEK(dekEnveloppe);

    const maj: Record<string, unknown> = {
      payout_method: args.methode,
      pii_dek: dekEnveloppe,
      coordonnees_maj_le: new Date().toISOString(),
    };

    if (args.methode === "paypal") {
      maj.paypal_email = (args.paypalEmail ?? "").trim().toLowerCase() || null;
    } else {
      maj.iban_holder = (args.titulaire ?? "").trim() || null;
      maj.bic = (args.bic ?? "").trim().toUpperCase() || null;
      const iban = (args.iban ?? "").replace(/[\s.-]/g, "").toUpperCase();
      if (iban) {
        maj.iban_chiffre = encryptField(iban, dek);
        maj.iban_masque = masquerIban(iban);
        // L'ancienne colonne en clair reste vide, pour toujours.
        maj.iban_number = null;
      }
    }

    const { error } = await supabaseAdmin.from(TABLE_AFF).update(maj).eq("sa", args.sa);
    if (error) {
      console.error(`[versement] ecriture coordonnees refusee : ${error.message}`);
      return { ok: false, reason: "base" };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[versement] ecriture coordonnees impossible : ${(e as Error).message}`);
    return { ok: false, reason: "chiffrement" };
  }
}

/**
 * FAIT PASSER LES COMMISSIONS MÛRES EN `approved`.
 *
 * La décision est dans `commissionApprouvable`, pure et testée. Ici on
 * ne fait que lire, filtrer et écrire.
 */
export async function approuverCommissionsMures(
  maintenant: number = Date.now(),
): Promise<{ approuvees: number }> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_COMM)
    .select("id, sa, status, commission_cents, sale_at, cancelled_at, payout_id")
    .eq("status", "pending")
    .limit(2000);
  if (error) {
    console.error(`[versement] lecture des commissions refusee : ${error.message}`);
    return { approuvees: 0 };
  }
  const mures = ((data ?? []) as CommissionAVerser[]).filter((c) =>
    commissionApprouvable(c, maintenant),
  );
  if (mures.length === 0) return { approuvees: 0 };

  const { error: majErr } = await supabaseAdmin
    .from(TABLE_COMM)
    .update({ status: "approved", approved_at: new Date(maintenant).toISOString() })
    .in("id", mures.map((c) => c.id));
  if (majErr) {
    console.error(`[versement] approbation refusee : ${majErr.message}`);
    return { approuvees: 0 };
  }
  return { approuvees: mures.length };
}

/** Construit le lot du mois, SANS rien écrire. C'est un aperçu. */
export async function preparerLot(): Promise<Lot | null> {
  try {
    const { data: comms } = await supabaseAdmin
      .from(TABLE_COMM)
      .select("id, sa, status, commission_cents, currency, sale_at, cancelled_at, payout_id")
      .eq("status", "approved")
      .is("payout_id", null)
      .limit(5000);
    const commissions = (comms ?? []) as CommissionAVerser[];
    if (commissions.length === 0) {
      return { lignes: [], ecartees: [], totalCents: 0, totalParMethode: { paypal: 0, virement: 0 } };
    }

    const sas = [...new Set(commissions.map((c) => c.sa))];
    const { data: affs } = await supabaseAdmin
      .from(TABLE_AFF).select(CHAMPS_AFF).in("sa", sas);

    const affiliees: AffilieePayable[] = ((affs ?? []) as LigneAffiliee[]).map((l) => {
      const coordonnees: Coordonnees = lireCoordonnees({
        payout_method: l.payout_method,
        paypal_email: l.paypal_email,
        iban_holder: l.iban_holder,
        iban_number: dechiffrerIban(l),
        bic: l.bic,
      });
      return {
        sa: l.sa,
        email: l.email,
        displayName: l.display_name,
        coordonnees,
        payable: peutEtrePayee(coordonnees),
      };
    });

    return construireLot(commissions, affiliees);
  } catch (e) {
    console.error(`[versement] preparation du lot impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * FIGE le lot : il devient une pièce, et les commissions passent en
 * `paid` en portant son identifiant.
 *
 * L'ordre compte : on crée le lot D'ABORD, puis on marque les
 * commissions. L'inverse laisserait des commissions marquées `paid`
 * pointant vers un lot qui n'existe pas, c'est à dire de l'argent qu'on
 * croit versé sans trace de virement.
 */
export async function figerLot(args: {
  periode: string;
  lot: Lot;
  par: string;
}): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (args.lot.lignes.length === 0) return { ok: false, reason: "lot_vide" };
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_LOTS)
      .insert({
        periode: args.periode,
        statut: "prepare",
        lignes: args.lot.lignes,
        ecartees: args.lot.ecartees,
        total_cents: args.lot.totalCents,
        total_paypal_cents: args.lot.totalParMethode.paypal,
        total_virement_cents: args.lot.totalParMethode.virement,
        prepare_par: args.par,
      })
      .select("id")
      .single();

    if (error) {
      // L'unicité sur `periode` est une PROTECTION : construire deux
      // fois le lot d'août paierait deux fois. Le refus se nomme.
      const doublon = /duplicate key|unique/i.test(error.message);
      console.error(`[versement] lot ${args.periode} non cree : ${error.message}`);
      return { ok: false, reason: doublon ? "lot_existe_deja" : "base" };
    }

    const id = (data as { id: string }).id;
    const ids = args.lot.lignes.flatMap((l) => l.commissionIds);
    const { error: majErr } = await supabaseAdmin
      .from(TABLE_COMM)
      .update({ status: "paid", paid_at: new Date().toISOString(), payout_id: id })
      .in("id", ids);
    if (majErr) {
      // Le lot existe, les commissions non marquées : elles
      // repartiraient dans le lot suivant, donc payées deux fois. On
      // CRIE, et l'admin verra deux lots pour les mêmes personnes.
      console.error(
        `[versement] lot ${id} cree mais commissions NON marquees (${majErr.message}). ` +
          `RISQUE DE DOUBLE PAIEMENT : verifier avant de deposer le fichier.`,
      );
      return { ok: false, reason: "commissions_non_marquees", id };
    }
    return { ok: true, id };
  } catch (e) {
    console.error(`[versement] lot impossible : ${(e as Error).message}`);
    return { ok: false, reason: "reseau" };
  }
}

export async function lireLots(limite = 24) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_LOTS).select("*").order("prepare_le", { ascending: false }).limit(limite);
  if (error) {
    console.error(`[versement] lecture des lots refusee : ${error.message}`);
    return [];
  }
  return data ?? [];
}

export async function lireLot(id: string) {
  const { data } = await supabaseAdmin.from(TABLE_LOTS).select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function marquerLot(
  id: string,
  statut: "exporte" | "paye" | "annule",
  par: string,
): Promise<boolean> {
  const maj: Record<string, unknown> = { statut };
  if (statut === "exporte") maj.exporte_le = new Date().toISOString();
  if (statut === "paye") {
    maj.paye_le = new Date().toISOString();
    maj.paye_par = par;
  }
  const { error } = await supabaseAdmin.from(TABLE_LOTS).update(maj).eq("id", id);
  if (error) {
    console.error(`[versement] lot ${id} non marque ${statut} : ${error.message}`);
    return false;
  }
  return true;
}
