// GET /api/quiz/[quizId]/analytics?period=7|30|90|all
//
// Aggregates the metrics for a quiz the caller owns. Read-only — all
// counters live on the quizzes table (views_count, completions_count)
// or are derived from the leads table on the fly. No new tables, no
// migration : we leverage what's already wired by the public quiz
// endpoint and the lead capture flow.
//
// Drop-off per question isn't computable yet (needs a quiz_session
// events table). Tracked as a follow-up.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PeriodKey = "7" | "30" | "90" | "all";

function parsePeriod(raw: string | null): { key: PeriodKey; sinceISO: string | null } {
  const k = (raw ?? "30").toLowerCase();
  if (k === "7" || k === "30" || k === "90") {
    const days = Number(k);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return { key: k as PeriodKey, sinceISO: d.toISOString() };
  }
  return { key: "all", sinceISO: null };
}

interface LeadRow {
  created_at: string;
  quiz_result_title: string | null;
  exported_sio: boolean | null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
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

  const period = parsePeriod(new URL(req.url).searchParams.get("period"));

  // Ownership + base counters in one shot
  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .select("id, title, views_count, completions_count, created_at")
    .eq("id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (quizErr || !quiz) {
    return NextResponse.json(
      { ok: false, error: "Quiz introuvable" },
      { status: 404 },
    );
  }

  // Pull all leads for this quiz scoped to the period. Capping at 5000
  // is plenty for a single quiz on the free / paid plans, but if a
  // power user blows past it the aggregations stay sane (under-count
  // rather than crash). Drop-off is for V2 — for now we just need
  // counts + distribution + daily series.
  let leadsQuery = supabase
    .from("leads")
    .select("created_at, quiz_result_title, exported_sio")
    .eq("user_id", user.id)
    .eq("source", "quiz")
    .eq("source_id", quizId)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (period.sinceISO) leadsQuery = leadsQuery.gte("created_at", period.sinceISO);

  const { data: leadsRaw, error: leadsErr } = await leadsQuery;
  if (leadsErr) {
    return NextResponse.json(
      { ok: false, error: leadsErr.message },
      { status: 400 },
    );
  }

  const leads = (leadsRaw ?? []) as LeadRow[];
  const leadsCount = leads.length;
  const exportedSio = leads.filter((l) => l.exported_sio === true).length;

  // Aggregate per result title — strip empty titles into a single
  // "Sans résultat" bucket so the pie chart isn't full of "(null)".
  const byResult = new Map<string, number>();
  for (const l of leads) {
    const key = (l.quiz_result_title ?? "").trim() || "Sans résultat";
    byResult.set(key, (byResult.get(key) ?? 0) + 1);
  }
  const resultDistribution = Array.from(byResult.entries())
    .map(([title, count]) => ({
      title,
      count,
      pct: leadsCount > 0 ? Math.round((count / leadsCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Daily series. Fill missing days with 0 so the line doesn't have
  // surprise gaps — visually misleading otherwise.
  const dayMap = new Map<string, number>();
  for (const l of leads) {
    const d = new Date(l.created_at);
    const k = d.toISOString().slice(0, 10);
    dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
  }
  const leadsByDay = (() => {
    if (leads.length === 0) return [];
    const start = period.sinceISO
      ? new Date(period.sinceISO)
      : new Date(leads[0]!.created_at);
    const end = new Date();
    const out: { date: string; count: number }[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const endDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    while (cursor.getTime() <= endDay.getTime()) {
      const k = cursor.toISOString().slice(0, 10);
      out.push({ date: k, count: dayMap.get(k) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // Cap at 365 days for "all time" with very old quizzes — recharts
    // would still render but the x-axis would be unreadable.
    return out.slice(-365);
  })();

  const captureRate =
    quiz.views_count > 0
      ? Math.round((leadsCount / quiz.views_count) * 1000) / 10
      : 0;
  const exportRate =
    leadsCount > 0
      ? Math.round((exportedSio / leadsCount) * 1000) / 10
      : 0;

  return NextResponse.json({
    ok: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      created_at: quiz.created_at,
    },
    period: period.key,
    metrics: {
      viewsCount: quiz.views_count,
      completionsCount: quiz.completions_count,
      leadsCount,
      exportedSioCount: exportedSio,
      captureRate,
      exportRate,
    },
    resultDistribution,
    leadsByDay,
  });
}
