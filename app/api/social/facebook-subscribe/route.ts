// POST /api/social/facebook-subscribe
// Abonne la Page Facebook connectée aux webhooks Meta (feed + messages).
// Doit être appelé une fois par connexion (ou rappelé si les events ne reçoivent pas).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Récupérer la connexion Facebook de l'user
  const { data: conn, error: connErr } = await supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  if (connErr || !conn) {
    return NextResponse.json({ error: "Aucune connexion Facebook trouvée" }, { status: 404 });
  }

  let pageToken: string;
  try {
    pageToken = decrypt(conn.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token illisible" }, { status: 500 });
  }

  // Appeler l'API Meta pour abonner la Page
  try {
    const params = new URLSearchParams({
      access_token: pageToken,
      subscribed_fields: "feed,messages",
    });
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${conn.platform_user_id}/subscribed_apps`,
      { method: "POST", body: params }
    );
    const json = await res.json();

    if (json.success) {
      return NextResponse.json({ ok: true, page_id: conn.platform_user_id });
    }
    return NextResponse.json({ error: json.error?.message ?? "Échec", detail: json }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
