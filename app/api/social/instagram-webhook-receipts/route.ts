// app/api/social/instagram-webhook-receipts/route.ts
// Renvoie les N derniers hits POST sur le webhook Instagram (lecture admin
// via supabaseAdmin car la table est en RLS deny-all). Sert à diagnostiquer
// pourquoi auto_comment_logs reste vide quand l'utilisateur signale que
// les automatisations ne se déclenchent pas en vrai.
//
// GET /api/social/instagram-webhook-receipts?limit=20
// Authentification utilisateur requise — pas de filtre par user_id car
// le webhook log est global (au moment du hit on n'a pas encore résolu
// le user).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawLimit = Number(new URL(req.url).searchParams.get("limit") ?? "20");
  const limit = Math.min(Math.max(rawLimit || 20, 1), 100);

  const { data, error } = await supabaseAdmin
    .from("meta_webhook_receipts")
    .select(
      "id, received_at, source, signature_present, signature_valid, payload_object, payload_excerpt, entry_count, processed_count, skipped_reason, http_status, error_message",
    )
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: data?.length ?? 0, receipts: data ?? [] });
}
