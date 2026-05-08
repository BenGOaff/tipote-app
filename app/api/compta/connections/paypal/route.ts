// POST /api/compta/connections/paypal
//
// Connexion d'un compte PayPal via OAuth 2.0 client_credentials :
// l'user crée une "app" dans son developer.paypal.com Dashboard, on
// stocke (clientId, secret, mode) JSON-encodé puis chiffré dans
// `payment_connections.api_key_encrypted`. Le mode `sandbox` est
// supporté pour les tests mais l'UI préviendra l'user (vente test ≠
// CA réel).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { encrypt } from "@/lib/crypto";
import { probePaypalCredentials, type PaypalCredentials } from "@/lib/compta/providers/paypal";
import { syncAllActiveConnections } from "@/lib/compta/syncEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PostBody = z.object({
  // Format réel : ~80 caractères pour clientId, ~80 pour secret. On
  // est tolérant pour ne pas rejeter des clés futures plus longues.
  clientId: z.string().trim().min(20).max(300),
  secret: z.string().trim().min(20).max(300),
  mode: z.enum(["live", "sandbox"]).default("live"),
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

  const creds: PaypalCredentials = {
    clientId: body.clientId.trim(),
    secret: body.secret.trim(),
    mode: body.mode,
  };

  // Probe immédiate : on échoue tout de suite si auth foire ou
  // Transaction Search pas activée.
  const probe = await probePaypalCredentials(creds);
  if (!probe.ok) {
    return NextResponse.json({ ok: false, error: probe.error }, { status: 400 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // On JSON-stringify avant d'encrypter pour stocker les 3 champs
  // (clientId, secret, mode) dans le seul champ api_key_encrypted —
  // le syncEngine sait re-parser au moment du sync.
  const encryptedCreds = encrypt(JSON.stringify(creds));
  const now = new Date().toISOString();

  let existQ = supabaseAdmin
    .from("payment_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "paypal");
  if (projectId) existQ = existQ.eq("project_id", projectId);
  const { data: existing } = await existQ.maybeSingle();

  let connectionId: string;
  if (existing?.id) {
    // Reconnexion → reset le sync initial pour re-pull les 24 mois.
    const { error } = await supabaseAdmin
      .from("payment_connections")
      .update({
        api_key_encrypted: encryptedCreds,
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
        provider: "paypal",
        api_key_encrypted: encryptedCreds,
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

  // Sync initial en background — on rend la main à l'user
  // immédiatement, l'UI affichera "Synchronisation initiale en cours"
  // tant que initial_sync_done_at est null.
  void (async () => {
    try {
      await syncAllActiveConnections(supabaseAdmin, { connectionId });
    } catch (e) {
      console.error("[paypal-connect] initial sync background error:", e);
    }
  })();

  return NextResponse.json({
    ok: true,
    connectionId,
    mode: creds.mode,
    initialSyncStarted: true,
  });
}
