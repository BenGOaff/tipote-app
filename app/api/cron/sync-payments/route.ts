// GET /api/cron/sync-payments
//
// Cron unique qui sync TOUTES les connexions PSP actives de tous
// les users en mode "delta" (depuis last_sync_at - 1h). Ajouter un
// nouveau provider plus tard (Mollie, PayPal, …) ne demande PAS de
// modifier ce cron — le syncEngine dispatch déjà selon le provider.
//
// Auth : header X-Cron-Secret == CRON_SECRET (env). Même convention
// que les autres crons Tipote (sio-sync-sales, sio-reconcile).
//
// À installer dans la crontab du VPS :
//   0 5 * * * curl -fsS -H "X-Cron-Secret: $CRON_SECRET" \
//     https://app.tipote.com/api/cron/sync-payments \
//     > /tmp/sync-payments.log 2>&1
//
// 5h du matin évite la fenêtre des autres crons (3h reconcile, 4h
// sio-sync) et tombe après les premières heures de la journée pour
// que les users voient leurs ventes du jour J au matin J+1.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncAllActiveConnections } from "@/lib/compta/syncEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 60s peut être un peu juste si beaucoup de users ont des comptes
// hyper actifs ; on laissera vivre et on monitorera. Si on tape la
// limite, on splittera par batches de 50 users via cursor.
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAllActiveConnections(supabaseAdmin);

  return NextResponse.json({
    ok: true,
    total: result.total,
    failed: result.failed,
    // Résumé compact pour les logs ; le détail vit dans les
    // payment_connections.last_sync_error pour les lignes en erreur.
    summary: result.outcomes.map((o) => ({
      provider: o.provider,
      ok: o.ok,
      fetched: o.fetched,
      upserted: o.upserted,
      initialSync: o.initialSync,
    })),
  });
}
