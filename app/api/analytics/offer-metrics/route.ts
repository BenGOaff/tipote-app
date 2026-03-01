// app/api/analytics/offer-metrics/route.ts
// GET: list offer metrics for user (last 12 months)
// POST: upsert offer metrics for a specific month + offer
// Also auto-aggregates data from hosted_pages + page_leads + quizzes + quiz_leads

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function safePct(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return clamp((num / den) * 100, 0, 9999);
}

function safeDiv(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return clamp(num / den, 0, 999999);
}

// ── GET — list offer metrics ───────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let query = supabase
    .from("offer_metrics")
    .select("*")
    .eq("user_id", user.id)
    .order("month", { ascending: false })
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, metrics: data ?? [] });
}

// ── POST — upsert offer metrics for a month ────────────────

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const offerName = String(body.offer_name ?? "").trim();
  const month = String(body.month ?? "").trim(); // yyyy-mm-dd
  if (!offerName || !month) {
    return NextResponse.json({ ok: false, error: "offer_name and month required" }, { status: 400 });
  }

  const visitors = Math.max(0, parseInt(body.visitors) || 0);
  const signups = Math.max(0, parseInt(body.signups) || 0);
  const salesCount = Math.max(0, parseInt(body.sales_count) || 0);
  const revenue = Math.max(0, parseFloat(body.revenue) || 0);
  const isPaid = Boolean(body.is_paid);
  const offerLevel = String(body.offer_level ?? "user_offer").trim();

  // Auto-calculate
  const captureRate = safePct(signups, visitors);
  const salesConversion = isPaid ? safePct(salesCount, signups) : 0;
  const revenuePerVisitor = safeDiv(revenue, visitors);

  const payload: Record<string, any> = {
    user_id: user.id,
    offer_name: offerName,
    offer_level: offerLevel,
    is_paid: isPaid,
    month,
    visitors,
    signups,
    sales_count: salesCount,
    revenue,
    capture_rate: captureRate,
    sales_conversion: salesConversion,
    revenue_per_visitor: revenuePerVisitor,
    linked_page_ids: body.linked_page_ids ?? [],
    linked_quiz_ids: body.linked_quiz_ids ?? [],
    updated_at: new Date().toISOString(),
  };

  if (projectId) payload.project_id = projectId;

  const { data, error } = await supabase
    .from("offer_metrics")
    .upsert(payload, { onConflict: "user_id,offer_name,month" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, metric: data });
}
