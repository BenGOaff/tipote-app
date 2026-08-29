// app/api/partner/affilies/[sa]/route.ts
//
// LA FICHE D'UN AFFILIÉ, POUR LE CENTRE DE PILOTAGE.
//
//   GET  header x-partner-secret  ->  { ok, affilie, filleuls, acheteurs }
//
// On rend QUI il a amené et ce que ces gens ont acheté. Aucune
// coordonnée de versement ne traverse : la console dit ce qu'on DOIT à
// quelqu'un, jamais où l'argent part.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import { construireFiche } from "@/lib/affiliate/ficheAffilie";
import { lireSa } from "@/lib/affiliate/saFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = process.env.PARTNER_SHARED_SECRET;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sa: string }> },
): Promise<NextResponse> {
  if (!SHARED) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { sa: brut } = await params;
  const sa = lireSa(brut);
  // Un identifiant qui n'a pas la forme attendue ne va pas jusqu'à la
  // base : il finirait dans une requête SQL.
  if (!sa) return NextResponse.json({ ok: false, reason: "sa_invalide" }, { status: 400 });

  try {
    const [affRes, aliasRes] = await Promise.all([
      supabaseAdmin
        .from("affiliates")
        .select("sa, email, display_name, status, ref, created_at")
        .eq("sa", sa)
        .maybeSingle(),
      supabaseAdmin.from("affiliate_sa_aliases").select("sa_alias, sa").eq("sa", sa),
    ]);

    if (!affRes.data) {
      return NextResponse.json({ ok: false, reason: "introuvable" }, { status: 404 });
    }

    const alias = new Map<string, string>();
    for (const a of ((aliasRes.data as { sa_alias: string; sa: string }[] | null) ?? [])) {
      alias.set(a.sa_alias, a.sa);
    }
    // SES identifiants, le courant et les anciens : les lignes écrites
    // sous un ancien lui appartiennent.
    const siens = [sa, ...alias.keys()];

    const [convRes, commRes] = await Promise.all([
      supabaseAdmin
        .from("affiliate_conversions")
        .select("sa, email, created_at")
        .in("sa", siens)
        .limit(5000),
      supabaseAdmin
        .from("affiliate_commissions")
        .select(
          "id, sa, status, commission_cents, currency, sale_at, cancelled_at, customer_email, product_name",
        )
        .in("sa", siens)
        .order("sale_at", { ascending: false })
        .limit(5000),
    ]);

    const fiche = construireFiche({
      sa,
      alias,
      conversions: (convRes.data as { sa: string; email: string | null; created_at: string | null }[] | null) ?? [],
      commissions: (commRes.data as never[] | null) ?? [],
      maintenant: Date.now(),
    });

    return NextResponse.json({
      ok: true,
      affilie: { ...affRes.data, alias: [...alias.keys()] },
      ...fiche,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[partner/affilies/:sa] lecture impossible : ${message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }
}
