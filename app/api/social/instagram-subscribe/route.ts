// app/api/social/instagram-subscribe/route.ts
//
// Re-souscrit le compte Instagram du user aux webhooks Meta sans qu'il
// ait besoin de déconnecter/reconnecter son compte. Utile quand :
//   - la souscription account-level a échoué à la connexion (race
//     condition, token pas encore activé Meta-side)
//   - l'user a basculé son compte IG Personnel ↔ Business (les
//     souscriptions sautent côté Meta)
//   - une app review Meta veut voir une re-souscription propre
//
// POST sans body. Auth = session Supabase (l'user doit être loggé,
// on récupère sa connexion IG via user_id).
//
// Retourne :
//   { ok: true, accountSubscribed: true, fields: ["comments","messages"] }
//
// ou si échec :
//   { ok: false, error: "..." }
//
// Cf. lib/meta.ts:subscribeInstagramAccountToWebhooks pour la raison
// d'être de ce double-niveau (app-level + account-level).

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import {
  subscribeInstagramAccountToWebhooks,
  getInstagramAccountSubscription,
} from "@/lib/meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Lookup la connexion IG du user
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "instagram")
    .maybeSingle();

  if (connErr || !conn) {
    return NextResponse.json(
      { ok: false, error: "No Instagram connection found. Connect your Instagram account first." },
      { status: 404 },
    );
  }

  const igUserId = conn.platform_user_id as string;
  let igToken: string;
  try {
    igToken = decrypt(conn.access_token_encrypted as string);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not decrypt Instagram token. Please reconnect your account." },
      { status: 500 },
    );
  }

  // Re-souscrit
  const result = await subscribeInstagramAccountToWebhooks(igUserId, igToken);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Subscription failed" },
      { status: 502 },
    );
  }

  // Vérifie l'état après souscription pour confirmer côté caller
  const status = await getInstagramAccountSubscription(igUserId, igToken);

  return NextResponse.json({
    ok: true,
    accountSubscribed: status.subscribed,
    fields: status.fields,
  });
}

// GET = status only (pour le bouton "Tester" qui peut afficher l'état
// actuel des souscriptions sans déclencher de re-subscribe).
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: conn } = await supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "instagram")
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ ok: false, error: "No Instagram connection found." }, { status: 404 });
  }

  const igUserId = conn.platform_user_id as string;
  let igToken: string;
  try {
    igToken = decrypt(conn.access_token_encrypted as string);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not decrypt token." }, { status: 500 });
  }

  const status = await getInstagramAccountSubscription(igUserId, igToken);
  return NextResponse.json({
    ok: true,
    accountSubscribed: status.subscribed,
    fields: status.fields,
    error: status.error,
  });
}
