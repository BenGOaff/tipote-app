// POST /api/compta/connections/sync-now
//
// Bouton "Synchroniser maintenant" côté UI. Sync uniquement les
// connexions de l'user appelant. Pas attendu : on lance en background
// pour ne pas bloquer la requête HTTP, l'UI affichera ensuite le
// nouveau last_sync_at via un refetch de /api/compta/connections.
//
// Le cron quotidien fait le même boulot pour tout le monde, ce
// endpoint sert juste pour les users qui veulent voir leur dashboard
// à jour immédiatement après un encaissement.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncAllActiveConnections } from "@/lib/compta/syncEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // On attend cette fois — l'user a cliqué un bouton et veut un
  // retour de "ça vient de marcher" ou "ça a échoué". Cap à 60s via
  // maxDuration.
  const result = await syncAllActiveConnections(supabaseAdmin, { userId: user.id });
  return NextResponse.json({
    ok: true,
    total: result.total,
    failed: result.failed,
    outcomes: result.outcomes.map((o) => ({
      provider: o.provider,
      ok: o.ok,
      fetched: o.fetched,
      upserted: o.upserted,
      initialSync: o.initialSync,
      error: o.error,
    })),
  });
}
