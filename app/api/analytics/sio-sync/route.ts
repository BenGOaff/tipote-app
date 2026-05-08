// POST /api/analytics/sio-sync
//
// Pulls the caller's Systeme.io sales since `sinceISO` (default = 6
// months ago) and upserts the per-offer monthly aggregates into
// offer_metrics. Idempotent — safe to call repeatedly.
//
// UI : button "Synchroniser maintenant" on the analytics page so the
// user can refresh on demand without waiting for the daily cron.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { nMonthsAgoISO, syncSioSalesForUser } from "@/lib/sio/syncRunner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }

  // Default window : 6 months — enough to populate the dashboard
  // history graph, bounded so the SIO API call stays fast.
  const sinceISO =
    typeof body.sinceISO === "string" && body.sinceISO.trim()
      ? body.sinceISO.trim()
      : nMonthsAgoISO(6);

  const projectId = await getActiveProjectId(supabase, user.id);

  // Run with admin client : the offer_metrics RLS policies are scoped
  // to auth.uid(), but the sync logic INSERTs / UPDATEs as service
  // role to be able to also clear and re-aggregate without tripping
  // user-only policies during the wipe step.
  const result = await syncSioSalesForUser(
    supabaseAdmin,
    user.id,
    projectId,
    sinceISO,
  );

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
