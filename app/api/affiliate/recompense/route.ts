// app/api/affiliate/recompense/route.ts
//
// LE CHOIX DE L'AFFILIÉ : abonnement moins cher, ou commissions plus fortes.
//
//   GET   -> { ok, choix, filleuls, remiseAboPct, commissionPct, prochaine, ... }
//   PATCH { choix } -> enregistre le choix, effet au recalcul suivant
//
// Béné, 25 août 2026 : "c'est lui qui choisit quand il remplit son profil
// et il peut switcher quand il veut de l'un à l'autre (ce sera pris en
// compte pour le mois suivant)."
//
// -- CE QU'ON REND, ET POURQUOI LES DEUX -------------------------------
//
// On rend ce qu'il a AUJOURD'HUI et ce que l'autre choix lui donnerait.
// Sans la comparaison, choisir revient à parier : il ne peut pas savoir
// si 20 filleuls valent mieux en remise ou en commission, et il ne
// changerait jamais. Les deux nombres viennent de la MÊME fonction que
// le recalcul mensuel : un écran qui recalcule une décision finit
// toujours par mentir.
//
// -- CE QU'ON NE FAIT PAS ----------------------------------------------
//
// On ne recompte PAS ses filleuls ici. Le décompte est un instantané
// écrit une fois par mois, et c'est lui qui fait foi : recompter à
// l'affichage donnerait un chiffre qui bouge entre deux pages, alors que
// ce qui compte est ce qui est EN VIGUEUR ce mois-ci.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateSession } from "@/lib/affiliate/session";
import {
  COMMISSION_BASE_PCT,
  effetDuChangement,
  prochaineMarche,
  recompenseDuMois,
  remiseAbonnementPct,
  tauxCommissionPct,
  type ChoixRecompense,
} from "@/lib/affiliate/recompense";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "recompense_choix, recompense_filleuls, recompense_remise_pct, recompense_commission_pct, recompense_calculee_le";

type Ligne = {
  recompense_choix?: string | null;
  recompense_filleuls?: number | null;
  recompense_remise_pct?: number | null;
  recompense_commission_pct?: number | null;
  recompense_calculee_le?: string | null;
};

/** L'état complet, tel que l'écran doit le montrer. */
function etat(l: Ligne | null) {
  const choix: ChoixRecompense = l?.recompense_choix === "abonnement" ? "abonnement" : "commissions";
  const filleuls = Number(l?.recompense_filleuls ?? 0);
  const enVigueur = recompenseDuMois(choix, filleuls);
  return {
    choix,
    filleuls,
    // Ce qui est appliqué CE MOIS-CI, lu en base : c'est ce qui a été
    // annoncé, pas ce qu'un décompte à la seconde donnerait.
    remiseAboPct: Number(l?.recompense_remise_pct ?? 0),
    commissionPct: Number(l?.recompense_commission_pct ?? COMMISSION_BASE_PCT),
    calculeeLe: l?.recompense_calculee_le ?? null,
    // Ce que le calcul donnerait avec le décompte actuel, pour que
    // l'écran puisse dire "ça prendra effet le mois prochain".
    aVenir: { remiseAboPct: enVigueur.remiseAboPct, commissionPct: enVigueur.commissionPct },
    // Et ce que l'AUTRE choix donnerait, sinon choisir revient à parier.
    autreChoix: {
      choix: choix === "abonnement" ? "commissions" : "abonnement",
      remiseAboPct: choix === "abonnement" ? 0 : remiseAbonnementPct(filleuls),
      commissionPct: choix === "abonnement" ? tauxCommissionPct(filleuls) : COMMISSION_BASE_PCT,
    },
    prochaine: prochaineMarche(choix, filleuls),
  };
}

async function lire(sa: string): Promise<{ ligne: Ligne | null; absente: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select(COLS)
    .eq("sa", sa)
    .maybeSingle();
  if (error) {
    // La migration peut ne pas être passée : l'écran doit s'ouvrir avec
    // les valeurs de base et le DIRE, pas tomber.
    console.error(
      `[affiliate/recompense] lecture impossible (migration 20260825_recompense_affilies appliquee ?) : ${error.message}`,
    );
    return { ligne: null, absente: true };
  }
  return { ligne: (data as unknown as Ligne | null) ?? null, absente: false };
}

export async function GET(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }
  const { ligne, absente } = await lire(session.sa);
  return NextResponse.json({ ok: true, indisponible: absente, ...etat(ligne) });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { choix?: unknown };
  // Une valeur qu'on ne sait pas lire n'écrit RIEN : on ne bascule pas
  // quelqu'un sur un mode qu'il n'a pas demandé.
  if (body.choix !== "abonnement" && body.choix !== "commissions") {
    return NextResponse.json({ ok: false, reason: "choix_invalide" }, { status: 400 });
  }
  const voulu = body.choix as ChoixRecompense;

  const avant = await lire(session.sa);
  const effet = effetDuChangement(avant.ligne?.recompense_choix, voulu);

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({ recompense_choix: voulu })
    .eq("sa", session.sa);

  if (error) {
    console.error(`[affiliate/recompense] ecriture impossible : ${error.message}`);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  // ON NE TOUCHE PAS AUX VALEURS EN VIGUEUR. Le changement prend effet
  // au recalcul suivant, et c'est exactement ce qui a été promis :
  // appliquer tout de suite ferait baisser une remise en cours de mois,
  // c'est à dire augmenter le prix de quelqu'un sans prévenir.
  const apres = await lire(session.sa);
  return NextResponse.json({ ok: true, effet, ...etat(apres.ligne) });
}
