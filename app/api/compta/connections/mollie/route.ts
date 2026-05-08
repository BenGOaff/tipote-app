// POST /api/compta/connections/mollie
//
// Connexion d'un compte Mollie via API key Bearer (live_… ou test_…).
// Plus simple que PayPal — pas d'OAuth, juste une clé à coller. Plus
// puissant que Stripe Restricted Key par contre : Mollie ne propose
// pas de clés en lecture seule, donc cette clé donne accès en lecture
// ET écriture à l'API Mollie. On le rappelle dans le guide UI.
//
// Pas de webhook, pas de refresh token : la clé est valable tant
// qu'elle n'est pas révoquée depuis le dashboard Mollie.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { encrypt } from "@/lib/crypto";
import { isLikelyMollieKey, probeMollieKey } from "@/lib/compta/providers/mollie";
import { syncAllActiveConnections } from "@/lib/compta/syncEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PostBody = z.object({
  apiKey: z.string().trim().min(20).max(300),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const apiKey = body.apiKey.trim();

  // Sanity check format Mollie : toutes les clés Mollie commencent
  // par live_ ou test_. Si l'user colle autre chose, on échoue tout
  // de suite avec un message lisible plutôt que d'attendre un 401.
  if (!isLikelyMollieKey(apiKey)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Format de clé inattendu. Mollie utilise `live_…` (production) ou `test_…` (test). Vérifie que tu as bien copié la clé entière depuis ton dashboard Mollie.",
      },
      { status: 400 },
    );
  }

  // Probe — détecte 401 / 403 immédiatement
  const probe = await probeMollieKey(apiKey);
  if (!probe.ok) {
    return NextResponse.json({ ok: false, error: probe.error }, { status: 400 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  const encryptedKey = encrypt(apiKey);
  const now = new Date().toISOString();

  let existQ = supabaseAdmin
    .from("payment_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "mollie");
  if (projectId) existQ = existQ.eq("project_id", projectId);
  const { data: existing } = await existQ.maybeSingle();

  let connectionId: string;
  if (existing?.id) {
    // Reconnexion → reset le sync initial pour re-pull les 24 mois.
    const { error } = await supabaseAdmin
      .from("payment_connections")
      .update({
        api_key_encrypted: encryptedKey,
        disabled_at: null,
        last_sync_error: null,
        initial_sync_done_at: null,
        last_sync_at: null,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    connectionId = existing.id;
  } else {
    const { data: ins, error } = await supabaseAdmin
      .from("payment_connections")
      .insert({
        user_id: user.id,
        project_id: projectId,
        provider: "mollie",
        api_key_encrypted: encryptedKey,
      })
      .select("id")
      .single();
    if (error || !ins) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Insert failed" },
        { status: 400 },
      );
    }
    connectionId = ins.id;
  }

  // Sync initial en background.
  void (async () => {
    try {
      await syncAllActiveConnections(supabaseAdmin, { connectionId });
    } catch (e) {
      console.error("[mollie-connect] initial sync background error:", e);
    }
  })();

  return NextResponse.json({
    ok: true,
    connectionId,
    mode: probe.mode ?? "live",
    initialSyncStarted: true,
  });
}
