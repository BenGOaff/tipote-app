// /api/compta/connections/stripe
//
//   POST    : pose une nouvelle Restricted Key Stripe
//             - Probe la clé pour détecter immédiatement une erreur
//               (révoquée / mauvais permissions / typo)
//             - Si OK : encrypt + upsert payment_connections + lance
//               le sync initial en background (fire-and-forget)
//   DELETE  : déconnecte la clé (soft-delete via disabled_at).
//             On garde la ligne pour le cron daily ne la sync plus
//             mais l'historique des transactions reste consultable.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { encrypt } from "@/lib/crypto";
import { probeStripeKey } from "@/lib/compta/providers/stripe";
import { syncAllActiveConnections } from "@/lib/compta/syncEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PostBody = z.object({
  // Restricted Key Stripe : `rk_live_…` ou `rk_test_…`. On accepte
  // aussi les Secret Keys (`sk_…`) au cas où l'user se trompe — Stripe
  // les acceptera côté serveur, et notre probe vérifiera les
  // permissions avant qu'on stocke. On préviendra l'user via un
  // warning si c'est une `sk_` (ils ont accès TOUT, dangereux).
  restrictedKey: z.string().trim().min(20).max(300),
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

  const apiKey = body.restrictedKey.trim();
  // Sanity check format Stripe — pas un blocage, on prévient juste
  // si ça commence par sk_ (clé secrète, dangereux) ou si le format
  // est complètement étranger.
  if (!apiKey.startsWith("rk_") && !apiKey.startsWith("sk_")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Format de clé inattendu. Stripe utilise `rk_live_…` (Restricted Key) ou `sk_live_…` (Secret Key).",
      },
      { status: 400 },
    );
  }

  // Probe — détecte 401 / 403 immédiatement
  const probe = await probeStripeKey(apiKey);
  if (!probe.ok) {
    return NextResponse.json({ ok: false, error: probe.error }, { status: 400 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Upsert. Si l'user reconnecte sa clé après un disabled_at, on
  // restaure la même ligne (UNIQUE sur user, project, provider).
  const encryptedKey = encrypt(apiKey);
  const now = new Date().toISOString();

  // Cherche d'abord une ligne existante (active ou disabled)
  let existQ = supabaseAdmin
    .from("payment_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "stripe");
  if (projectId) existQ = existQ.eq("project_id", projectId);
  const { data: existing } = await existQ.maybeSingle();

  let connectionId: string;
  if (existing?.id) {
    // Reconnexion : reset le sync initial pour re-pull les 24 mois.
    // Si l'user a perdu l'accès puis l'a retrouvé, on ne sait pas
    // ce qui a bougé entre temps — autant repartir sur du propre.
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
        provider: "stripe",
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

  // Lance le sync initial en background. On n'attend pas — on rend
  // la main à l'user immédiatement (le sync de 24 mois peut prendre
  // 5-30 secondes selon le volume). L'UI affichera "synchronisation
  // en cours…" tant que initial_sync_done_at est null.
  void (async () => {
    try {
      await syncAllActiveConnections(supabaseAdmin, { connectionId });
    } catch (e) {
      console.error("[stripe-connect] initial sync background error:", e);
    }
  })();

  return NextResponse.json({
    ok: true,
    connectionId,
    livemode: probe.livemode === true,
    initialSyncStarted: true,
  });
}

const DeleteBody = z.object({
  connectionId: z.string().uuid(),
});

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof DeleteBody>;
  try {
    body = DeleteBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  // Soft-delete : on garde la ligne (et les transactions) mais on
  // arrête le cron. Si l'user reconnecte, on réactive la ligne via POST.
  const { error } = await supabaseAdmin
    .from("payment_connections")
    .update({ disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", body.connectionId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
