// GET /api/cron/sio-sync-sales
//
// Daily cron : pulls Systeme.io sales for every user who has a SIO
// API key configured, aggregates them per offer + month, and upserts
// into `offer_metrics`. Schedule via vercel.json:
//   { "crons": [{ "path": "/api/cron/sio-sync-sales", "schedule": "0 4 * * *" }] }
//
// Auth : header X-Cron-Secret must match CRON_SECRET (same convention
// as /api/cron/sio-reconcile).
//
// Window : last 35 days by default — covers any webhook lost in the
// previous days + a small overlap to be safe. Daily cadence means
// each user's sales are refreshed at most 24h late.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncSioSalesForUser } from "@/lib/sio/syncRunner";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function authorise(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

export async function GET(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 35-day window — safe margin past the daily cadence.
  const since = new Date();
  since.setDate(since.getDate() - 35);
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  // Pick rows that have either an encrypted or a plaintext API key.
  // Multi-projet : on itère par row business_profiles pour que
  // chaque projet (chacun pouvant avoir sa propre clé SIO) soit
  // synchronisé indépendamment.
  const { data: rows, error } = await supabaseAdmin
    .from("business_profiles")
    .select("user_id, project_id, sio_user_api_key, sio_user_api_key_enc")
    .or("sio_user_api_key_enc.not.is.null,sio_user_api_key.not.is.null");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const summary: Array<{
    user_id: string;
    project_id: string | null;
    ok: boolean;
    sales: number;
    revenue: number;
    error?: string;
  }> = [];

  // Sequential to keep the SIO API rate-limit happy. 50 users with
  // ~5 sales / month = ~250 SIO calls in ~1 minute, well under any
  // sane rate limit.
  for (const row of rows ?? []) {
    const r: any = row;
    try {
      const result = await syncSioSalesForUser(
        supabaseAdmin,
        r.user_id,
        r.project_id ?? null,
        sinceISO,
      );
      summary.push({
        user_id: r.user_id,
        project_id: r.project_id ?? null,
        ok: result.ok,
        sales: result.salesPulled,
        revenue: result.totalRevenue,
        error: result.error,
      });
    } catch (e) {
      summary.push({
        user_id: r.user_id,
        project_id: r.project_id ?? null,
        ok: false,
        sales: 0,
        revenue: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totalSales = summary.reduce((a, b) => a + b.sales, 0);
  const totalRevenue = summary.reduce((a, b) => a + b.revenue, 0);
  const failures = summary.filter((s) => !s.ok).length;

  console.log(
    `[sio-sync-sales] processed=${summary.length} sales=${totalSales} revenue=${totalRevenue.toFixed(2)} failures=${failures}`,
  );

  return NextResponse.json({
    ok: true,
    processed: summary.length,
    totalSales,
    totalRevenue,
    failures,
    summary,
  });
}
