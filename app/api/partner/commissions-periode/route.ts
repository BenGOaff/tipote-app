// app/api/partner/commissions-periode/route.ts
//
// CE QUI SORT, SUR LA MÊME PÉRIODE QUE CE QUI RENTRE.
//
//   GET ?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ   header x-partner-secret
//   ->  { ok, dues, sousGarantie, versees, annulees, autresDevises, nb }
//
// Béné : "équilibre entre ventes (ce qui rentre) et affiliation (ce qui
// sort)."
//
// -- POURQUOI UNE PORTE À PART DU TABLEAU DES AFFILIÉS ------------------
//
// Le tableau est un REGISTRE : il dit ce qu'on doit à chacun, depuis
// toujours. La balance est une PÉRIODE : elle dit ce que le mois a
// coûté. Servir les deux depuis le même point d'entrée obligerait à
// filtrer les clics et les inscrits par date, ce qui n'a pas de sens
// pour un registre, et donnerait deux écrans qui ne comptent pas pareil.
//
// -- LES DEUX BORNES SONT INCLUSES -------------------------------------
//
// "Du 1er au 31" doit contenir le 31, sinon le dernier jour du mois
// manque au coût et personne ne le remarque avant de comparer.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import { commissionApprouvable, type CommissionAVerser } from "@/lib/affiliate/versement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = process.env.PARTNER_SHARED_SECRET;

function jour(brut: string | null): string | null {
  const v = String(brut ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!SHARED) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const debut = jour(req.nextUrl.searchParams.get("debut"));
  const fin = jour(req.nextUrl.searchParams.get("fin"));

  try {
    let q = supabaseAdmin
      .from("affiliate_commissions")
      .select("id, sa, status, commission_cents, currency, sale_at, cancelled_at")
      .order("sale_at", { ascending: false })
      .limit(20000);
    if (debut) q = q.gte("sale_at", `${debut}T00:00:00Z`);
    // La borne haute est INCLUSE : on va jusqu'à la fin du jour.
    if (fin) q = q.lte("sale_at", `${fin}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) throw error;

    const maintenant = Date.now();
    const lignes = (data as CommissionAVerser[] | null) ?? [];

    let dues = 0;
    let sousGarantie = 0;
    let versees = 0;
    let annulees = 0;
    let autresDevises = 0;

    for (const c of lignes) {
      const statut = String(c.status ?? "").trim().toLowerCase();
      const devise = String(c.currency ?? "EUR").trim().toUpperCase() || "EUR";
      const cents = Number(c.commission_cents) || 0;
      const annulee = Boolean(c.cancelled_at) || statut === "cancelled" || statut === "rejected";

      // UNE AUTRE DEVISE NE S'ADDITIONNE PAS AUX EUROS. Elle est comptée
      // à part : on ne convertit pas, un taux inventé produirait une
      // balance fausse qui a l'air juste.
      if (devise !== "EUR") {
        autresDevises += 1;
        continue;
      }
      if (annulee) annulees += cents;
      else if (statut === "paid") versees += cents;
      else if (statut === "approved" || commissionApprouvable(c, maintenant)) dues += cents;
      else sousGarantie += cents;
    }

    return NextResponse.json({
      ok: true,
      dues,
      sousGarantie,
      versees,
      annulees,
      autresDevises,
      nb: lignes.length,
      // Le plafond est DIT : au delà, la balance serait tronquée sans
      // que rien ne le signale.
      tronque: lignes.length >= 20000,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[partner/commissions-periode] lecture impossible : ${message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }
}
