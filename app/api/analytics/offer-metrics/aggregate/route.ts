// app/api/analytics/offer-metrics/aggregate/route.ts
// POST: Auto-aggregate stats from hosted_pages + page_leads + quizzes + quiz_leads
// Returns aggregated data per page/quiz for a given month so the user can map them to offers

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const month = String(body.month ?? "").trim(); // yyyy-mm-dd (first day of month)
  if (!month) {
    return NextResponse.json({ ok: false, error: "month required (yyyy-mm-dd)" }, { status: 400 });
  }

  // Parse month boundaries
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const startISO = monthStart.toISOString();
  const endISO = monthEnd.toISOString();

  // ── Fetch hosted pages ──
  let pagesQuery = supabase
    .from("hosted_pages")
    .select("id, title, page_type, views_count, leads_count, slug")
    .eq("user_id", user.id);
  if (projectId) pagesQuery = pagesQuery.eq("project_id", projectId);
  const { data: pages } = await pagesQuery;

  // ── Fetch page leads created this month ──
  const pageIds = (pages ?? []).map((p: any) => p.id);
  const pageLeadCounts: Record<string, number> = {};

  if (pageIds.length > 0) {
    // Comptage agrégé en SQL (RPC) — plus de fetch ligne par ligne plafonné
    // à 1000 (sous-comptage si > 1000 leads de page dans le mois).
    const { data: rows } = await supabase.rpc("page_leads_count_by_page", {
      p_page_ids: pageIds,
      p_since: startISO,
      p_until: endISO,
    });
    for (const r of (rows ?? []) as { page_id: string; n: number }[]) {
      pageLeadCounts[r.page_id] = Number(r.n) || 0;
    }
  }

  // ── Fetch quizzes ──
  let quizzesQuery = supabase
    .from("quizzes")
    .select("id, title, views_count")
    .eq("user_id", user.id);
  if (projectId) quizzesQuery = quizzesQuery.eq("project_id", projectId);
  const { data: quizzes } = await quizzesQuery;

  // ── Fetch quiz leads created this month ──
  const quizIds = (quizzes ?? []).map((q: any) => q.id);
  const quizLeadCounts: Record<string, number> = {};

  if (quizIds.length > 0) {
    // Comptage agrégé en SQL (RPC) — plus de fetch ligne par ligne plafonné
    // à 1000 (sous-comptage si > 1000 leads de quiz dans le mois).
    const { data: rows } = await supabase.rpc("quiz_leads_count_by_quiz", {
      p_quiz_ids: quizIds,
      p_since: startISO,
      p_until: endISO,
    });
    for (const r of (rows ?? []) as { quiz_id: string; n: number }[]) {
      quizLeadCounts[r.quiz_id] = Number(r.n) || 0;
    }
  }

  // ── Build response ──
  const pageStats = (pages ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    type: "page" as const,
    page_type: p.page_type,
    slug: p.slug,
    total_views: p.views_count ?? 0,
    total_leads: p.leads_count ?? 0,
    month_leads: pageLeadCounts[p.id] || 0,
  }));

  const quizStats = (quizzes ?? []).map((q: any) => ({
    id: q.id,
    title: q.title,
    type: "quiz" as const,
    total_views: q.views_count ?? 0,
    month_leads: quizLeadCounts[q.id] || 0,
  }));

  return NextResponse.json({
    ok: true,
    month,
    pages: pageStats,
    quizzes: quizStats,
  });
}
