// app/api/partner/affilies/route.ts
//
// LE SUIVI DES AFFILIÉS, POUR LE CENTRE DE PILOTAGE.
//
//   GET  header x-partner-secret  ->  { ok: true, lignes, totaux, arrete }
//
// Béné veut voir ses affiliés depuis un seul écran. Le registre vit
// ICI, sur la base de Tipote, et il y reste : le copier là-bas donnerait
// deux registres, donc deux réponses différentes le jour où l'un prend
// du retard. La console demande, elle ne duplique pas.
//
// -- CE QU'ON NE REND PAS, ET C'EST DÉLIBÉRÉ ---------------------------
//
// Ni IBAN, ni email PayPal, ni aucune coordonnée de versement. Elles
// sont chiffrées en base et ne ressortent jamais en clair, pas même à
// leur propriétaire (règle du 25 août) : un écran se photographie, se
// partage, se laisse ouvert. La console affiche ce qu'on DOIT à
// quelqu'un, jamais où l'argent part.
//
// -- LES CLICS SONT COMPTÉS EN BASE ------------------------------------
//
// La vue `affiliate_stats` agrège déjà par identifiant. Lire les lignes
// de clics à la place imposerait un plafond, et un plafond sur un
// compteur donne un chiffre faux qui a l'air juste. La vue ne sait en
// revanche PAS suivre les alias ni séparer "à verser" de "sous
// garantie" : ces deux décisions vivent dans le module pur.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import {
  construireTableauAffilies,
  trierAffilies,
  type EntreeAffilie,
} from "@/lib/affiliate/tableauAffilies";
import type { CommissionAVerser } from "@/lib/affiliate/versement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = process.env.PARTNER_SHARED_SECRET;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!SHARED) {
    // On DIT que la porte n'est pas configurée. Un 401 laisserait
    // chercher un secret de travers pendant une heure.
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  try {
    const [affsRes, statsRes, aliasRes, convRes, commRes] = await Promise.all([
      supabaseAdmin
        .from("affiliates")
        .select("sa, email, display_name, status, ref, created_at")
        .limit(2000),
      supabaseAdmin.from("affiliate_stats").select("sa, total_clicks").limit(2000),
      supabaseAdmin.from("affiliate_sa_aliases").select("sa_alias, sa").limit(2000),
      supabaseAdmin.from("affiliate_conversions").select("sa, email").limit(20000),
      supabaseAdmin
        .from("affiliate_commissions")
        .select("id, sa, status, commission_cents, currency, sale_at, cancelled_at, payout_id")
        .order("sale_at", { ascending: false })
        .limit(20000),
    ]);

    if (affsRes.error) throw affsRes.error;

    // UNE TABLE OU UNE VUE ABSENTE NE VIDE PAS L'ÉCRAN. La migration des
    // alias peut ne pas être passée, et la vue peut manquer sur une base
    // ancienne : on perd la colonne concernée, pas la page.
    const alias = new Map<string, string>();
    for (const a of ((aliasRes.data as { sa_alias: string; sa: string }[] | null) ?? [])) {
      alias.set(a.sa_alias, a.sa);
    }
    const clicsParSa = new Map<string, number>();
    for (const s of ((statsRes.data as { sa: string; total_clicks: number }[] | null) ?? [])) {
      clicsParSa.set(s.sa, Number(s.total_clicks) || 0);
    }

    const lignes = trierAffilies(
      construireTableauAffilies({
        affilies: ((affsRes.data as EntreeAffilie[] | null) ?? []),
        alias,
        clicsParSa,
        conversions: ((convRes.data as { sa: string; email: string | null }[] | null) ?? []),
        commissions: ((commRes.data as CommissionAVerser[] | null) ?? []),
        maintenant: Date.now(),
      }),
    );

    return NextResponse.json({
      ok: true,
      lignes,
      // CE QU'ON N'A PAS PU LIRE SE DIT. Un écran qui affiche zéro clic
      // parce qu'une vue manque est indiscernable d'un affilié qui n'a
      // rien fait.
      manque: {
        clics: Boolean(statsRes.error),
        alias: Boolean(aliasRes.error),
        conversions: Boolean(convRes.error),
        commissions: Boolean(commRes.error),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[partner/affilies] lecture impossible : ${message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }
}
