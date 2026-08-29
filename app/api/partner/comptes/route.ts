// app/api/partner/comptes/route.ts (Tipote)
//
// QUI A UN COMPTE TIPOTE.
//
// Béné, 29 août : "sur la liste de clients tu peux pas me faire un truc
// joli et que je vois en un clin d'oeil de QUOI il est client ? Tiquiz ?
// Atelier ? Tipote ?"
//
// La console de pilotage vit dans Tiquiz et lit la base de Tiquiz. Sans
// cette porte, la pastille Tipote serait décorative : affichée à partir
// de rien, donc fausse. Une pastille qu'on ne peut pas prouver est pire
// qu'une pastille absente.
//
// -- ELLE NE REND QUE DES ADRESSES ET UN PALIER -----------------------
//
// Pas de nom, pas de date, pas de contenu. Un point d'entrée interne qui
// rend plus que nécessaire finit par être appelé pour autre chose, et on
// se retrouve avec deux fiches client qui se contredisent. La fiche
// Tipote reste dans Tipote.

import { NextRequest, NextResponse } from "next/server";

import { safeEqual } from "@/lib/partner/tokens";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Au delà, on tronque et on le DIT : une liste coupée en silence ment. */
const PLAFOND = 20000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = String(process.env.PARTNER_SHARED_SECRET ?? "").trim();
  if (!secret) {
    // "Pas configuré" et "refusé" ne se corrigent pas au même endroit.
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", secret)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, plan")
    .limit(PLAFOND);

  if (error) {
    console.error(`[partner/comptes] lecture impossible : ${error.message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }

  const lignes = (data as { email: string | null; plan: string | null }[] | null) ?? [];
  const comptes: Record<string, string> = {};
  for (const l of lignes) {
    const email = String(l.email ?? "").trim().toLowerCase();
    if (!email) continue;
    // Le palier sert à distinguer un compte gratuit d'un client payant,
    // exactement comme côté Tiquiz. Une valeur absente vaut "free" : le
    // défaut de la colonne, et le cas de tous les comptes historiques.
    comptes[email] = String(l.plan ?? "free").trim() || "free";
  }

  return NextResponse.json({
    ok: true,
    comptes,
    tronque: lignes.length >= PLAFOND,
  });
}
