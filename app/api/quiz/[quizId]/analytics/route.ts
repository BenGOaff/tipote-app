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
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dateKeyForOffset, parseTzOffset } from "@/lib/dateKeys";

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

  const reqUrl = new URL(req.url);
  const period = parsePeriod(reqUrl.searchParams.get("period"));
  // Fuseau du client pour bucketiser le graphe sur son jour local.
  const tzOffset = parseTzOffset(reqUrl.searchParams.get("tz"));

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

  // Daily series. Bucketing en jour LOCAL du créateur (tzOffset) — clés
  // ET leads — pour que "aujourd'hui" ne soit jamais vide à cause d'un
  // décalage UTC (bug Adeline 24/05). Fill des jours manquants à 0.
  const dayMap = new Map<string, number>();
  for (const l of leads) {
    const k = dateKeyForOffset(new Date(l.created_at), tzOffset);
    dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
  }
  const leadsByDay = (() => {
    if (leads.length === 0) return [];
    const start = period.sinceISO
      ? new Date(period.sinceISO)
      : new Date(leads[0]!.created_at);
    const out: { date: string; count: number }[] = [];
    const endKey = dateKeyForOffset(new Date(), tzOffset);
    let t = start.getTime();
    let seen = "";
    const guard = Date.now() + 24 * 3600 * 1000;
    while (t <= guard) {
      const k = dateKeyForOffset(new Date(t), tzOffset);
      if (k !== seen) {
        out.push({ date: k, count: dayMap.get(k) ?? 0 });
        seen = k;
      }
      if (k === endKey) break;
      t += 24 * 3600 * 1000;
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

  // ── Funnel: drop-off per question ──
  // We count distinct sessions that VIEWED each question. Drop-off
  // between Q[n] and Q[n+1] = (views[n] - views[n+1]) / views[n].
  // The ratio is enough to flag the worst-performing question; we
  // expose absolute counts too so the UI can show "47% on Q3".
  let funnel: {
    questionIndex: number;
    views: number;
    answers: number;
    dropFromPrevious: number;
  }[] = [];
  let totalSessions = 0;
  try {
    let qEventsQuery = supabaseAdmin
      .from("quiz_question_events")
      .select("question_index, session_id, event")
      .eq("quiz_id", quizId)
      .order("question_index", { ascending: true })
      .limit(50000);
    if (period.sinceISO) qEventsQuery = qEventsQuery.gte("created_at", period.sinceISO);

    const { data: qEvents } = await qEventsQuery;
    const rows = (qEvents ?? []) as {
      question_index: number;
      session_id: string;
      event: "view" | "answer";
    }[];

    // Distinct sessions per (qIdx, event). Sets are O(1) hash inserts
    // and fit comfortably in memory at our volume (50k rows cap).
    const viewsByQ = new Map<number, Set<string>>();
    const answersByQ = new Map<number, Set<string>>();
    for (const r of rows) {
      const targetMap = r.event === "answer" ? answersByQ : viewsByQ;
      let bucket = targetMap.get(r.question_index);
      if (!bucket) {
        bucket = new Set();
        targetMap.set(r.question_index, bucket);
      }
      bucket.add(r.session_id);
    }

    const allQs = Array.from(
      new Set([...viewsByQ.keys(), ...answersByQ.keys()]),
    ).sort((a, b) => a - b);

    let prevViews = 0;
    for (const qIdx of allQs) {
      const v = viewsByQ.get(qIdx)?.size ?? 0;
      const a = answersByQ.get(qIdx)?.size ?? 0;
      const drop =
        qIdx === allQs[0] || prevViews === 0
          ? 0
          : Math.round(((prevViews - v) / prevViews) * 1000) / 10;
      funnel.push({
        questionIndex: qIdx,
        views: v,
        answers: a,
        dropFromPrevious: Math.max(0, drop),
      });
      prevViews = v;
    }
    totalSessions = funnel[0]?.views ?? 0;
  } catch (e) {
    // Table might not exist yet on a fresh deploy — fail-open with
    // an empty funnel rather than 500 the whole analytics endpoint.
    console.warn("[quiz/analytics] funnel build failed:", e);
  }

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
    funnel,
    totalFunnelSessions: totalSessions,
  });
}
