// app/api/partner/token/route.ts
// Echange app-a-app (L'Atelier du Quiz -> Tipote) : un code a usage unique
// contre un token durable de lecture. Authentifie par le secret partage
// PARTNER_SHARED_SECRET (header x-partner-secret). Le code est consomme.
// Miroir du pont deja en prod cote Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomSecret, hashSecret, safeEqual } from "@/lib/partner/tokens";

export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

export async function POST(req: NextRequest) {
  if (!SHARED || !safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  if (!code) return NextResponse.json({ ok: false, reason: "no_code" }, { status: 400 });

  const codeHash = hashSecret(code);
  const { data: row } = await supabaseAdmin
    .from("partner_auth_codes")
    .select("id, user_id, expires_at, consumed_at")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (!row || row.consumed_at || new Date(row.expires_at as string) < new Date()) {
    return NextResponse.json({ ok: false, reason: "invalid_code" }, { status: 400 });
  }

  await supabaseAdmin
    .from("partner_auth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  const token = randomSecret();
  const { error } = await supabaseAdmin.from("partner_connections").insert({
    token_hash: hashSecret(token),
    user_id: row.user_id,
    partner: "formaquiz",
  });
  if (error) return NextResponse.json({ ok: false, reason: "db" }, { status: 500 });

  // Email du compte (pour que l'Atelier affiche quel Tipote est connecte).
  let email: string | null = null;
  try {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(row.user_id as string);
    email = u?.user?.email ?? null;
  } catch {
    /* email optionnel */
  }

  return NextResponse.json({ ok: true, token, user_id: row.user_id, email });
}
