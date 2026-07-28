// app/api/partner/authorize/route.ts
// Etape de consentement (cote Tipote) : l'utilisateur CONNECTE autorise
// L'Atelier du Quiz a lire ses metriques. On cree un code a usage unique
// (TTL 10 min) et on renvoie l'URL de retour vers l'Atelier (callback FIXE,
// jamais pris depuis la requete, pour eviter les redirections ouvertes).
// Miroir du pont deja en prod cote Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomSecret, hashSecret } from "@/lib/partner/tokens";

export const dynamic = "force-dynamic";

const CALLBACK = (
  process.env.FORMAQUIZ_CONNECT_CALLBACK ??
  "https://quizing.tipote.com/api/integrations/tiquiz/callback"
).trim();

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauth" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { state?: unknown };
  const state = typeof body.state === "string" ? body.state.slice(0, 256) : "";
  if (!state) return NextResponse.json({ ok: false, reason: "no_state" }, { status: 400 });

  const code = randomSecret();
  const { error } = await supabaseAdmin.from("partner_auth_codes").insert({
    code_hash: hashSecret(code),
    user_id: user.id,
    partner: "formaquiz",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, reason: "db" }, { status: 500 });

  const redirect = `${CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  return NextResponse.json({ ok: true, redirect });
}
