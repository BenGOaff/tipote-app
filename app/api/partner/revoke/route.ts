// app/api/partner/revoke/route.ts
// Revoque un token de connexion (l'eleve a deconnecte son Tipote cote
// Atelier). Authentifie par le secret partage app-a-app. Miroir Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashSecret, safeEqual } from "@/lib/partner/tokens";

export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

export async function POST(req: NextRequest) {
  if (!SHARED || !safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ ok: false, reason: "no_token" }, { status: 400 });

  await supabaseAdmin
    .from("partner_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashSecret(token));

  return NextResponse.json({ ok: true });
}
