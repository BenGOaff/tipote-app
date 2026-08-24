// lib/affiliate/annulationStore.ts
//
// LIRE ET ÉCRIRE L'ANNULATION. AUCUNE DÉCISION ICI.
//
// La décision vit dans `annulation.ts`, pure et testée. Ce fichier
// importe `supabaseAdmin`, donc il exige des variables d'environnement
// au chargement, donc aucun test ne peut l'importer : c'est exactement
// pour ça qu'il ne doit rien décider (leçon du verrou des webhooks,
// 24 août).

import "server-only";

import {
  decideAnnulation,
  resultatVide,
  type MotifAnnulation,
  type ResultatAnnulation,
} from "@/lib/affiliate/annulation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TABLE = "affiliate_commissions";

interface LigneCommission {
  id: string;
  sa: string;
  status: string | null;
  payout_id: string | null;
  commission_cents: number | null;
  customer_email: string | null;
}

/**
 * ANNULE LES COMMISSIONS D'UNE VENTE.
 *
 * La clé est `(source_app, sio_order_id)`, la même que celle qui a créé
 * la ligne : c'est ce qui rend l'opération idempotente et rejouable, y
 * compris quand le fournisseur renvoie deux fois le même remboursement.
 *
 * On ne SUPPRIME jamais : `status = 'cancelled'` + `cancelled_at`.
 * L'affilié doit pouvoir voir dans son historique que cette vente a été
 * remboursée, sinon la ligne disparaît de son tableau sans un mot et il
 * conclut qu'on l'a volé.
 */
export async function annulerCommissionsDeLaVente(args: {
  sourceApp: "tipote" | "tiquiz";
  orderId: string;
  motif: MotifAnnulation;
}): Promise<ResultatAnnulation> {
  const sortie = resultatVide();
  const orderId = String(args.orderId ?? "").trim();
  if (!orderId) return sortie;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("id, sa, status, payout_id, commission_cents, customer_email")
    .eq("source_app", args.sourceApp)
    .eq("sio_order_id", orderId);

  if (error) {
    // On ne se tait pas : c'est de l'argent qui va partir si personne ne
    // regarde. Le webhook appelant, lui, ne doit pas échouer pour ça.
    console.error(
      `[affiliate/annulation] lecture impossible pour ${args.sourceApp}:${orderId} : ${error.message}`,
    );
    return sortie;
  }

  const lignes = (data ?? []) as LigneCommission[];
  if (lignes.length === 0) {
    // Cas NORMAL et fréquent : la vente n'avait pas d'affilié. Ce n'est
    // pas un incident, on ne crie pas.
    return sortie;
  }

  const aAnnuler: string[] = [];
  for (const l of lignes) {
    const quoi = decideAnnulation({ statut: l.status, payoutId: l.payout_id });
    if (quoi === "annuler") {
      aAnnuler.push(l.id);
      sortie.annulees += 1;
    } else if (quoi === "deja-close") {
      sortie.dejaCloses += 1;
    } else {
      sortie.tropTard += 1;
      sortie.tropTardCents += Math.max(0, Math.round(Number(l.commission_cents ?? 0)));
      // CE CAS EST POUR UN HUMAIN. L'argent est parti, et la facture
      // d'autofacturation qui le justifie a été remise à un comptable :
      // on ne réécrit ni l'une ni l'autre.
      console.error(
        `[affiliate/annulation] ${args.sourceApp}:${orderId} : commission ${l.id} DEJA VERSEE ` +
          `a ${l.sa} (${l.commission_cents ?? 0} c) alors que la vente est ${args.motif}. ` +
          `A recuperer a la main : compenser sur le lot suivant ou ecrire a l'affilie.`,
      );
    }
  }

  if (aAnnuler.length > 0) {
    const { error: majErr } = await supabaseAdmin
      .from(TABLE)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", aAnnuler);
    if (majErr) {
      console.error(
        `[affiliate/annulation] ${args.sourceApp}:${orderId} : ecriture refusee (${majErr.message}). ` +
          `LA COMMISSION VA MURIR ET PARTIR AU PROCHAIN LOT.`,
      );
      return resultatVide();
    }
    console.log(
      `[affiliate/annulation] ${args.sourceApp}:${orderId} (${args.motif}) : ` +
        `${aAnnuler.length} commission(s) annulee(s)`,
    );
  }

  return sortie;
}
