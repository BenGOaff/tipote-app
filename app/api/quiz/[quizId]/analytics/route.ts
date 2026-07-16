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
import { stripHtml } from "@/lib/richText";

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

  // ════════════════════════════════════════════════════════════════
  // STATISTIQUES — refonte fiabilité (Béné 2 juin 2026). Identique au
  // fix Tiquiz. RÈGLE D'OR : jamais deux fenêtres temporelles ni deux
  // sources dans le même ratio.
  //   - KPI cards ("cumulé depuis le début") = LIFETIME pour vues ET leads.
  //   - Time-series + distribution = filtrées par la période choisie.
  //   - Taux de capture HONNÊTE : si vues trackées < leads (incomplètes),
  //     captureRate=null + viewsReliable=false → l'UI affiche "—" + note.
  // ════════════════════════════════════════════════════════════════

  // ── A) LEADS lifetime (KPI) ──
  const { count: lifetimeLeadsCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("source", "quiz")
    .eq("source_id", quizId);
  const { count: lifetimeExportedSio } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("source", "quiz")
    .eq("source_id", quizId)
    .eq("exported_sio", true);

  // Leads de la PÉRIODE (time-series + distribution) — agrégés DANS la
  // base, sans plafond (avant : cap 5000 → sous-comptage des quiz viraux).
  // Deux vues : par jour (graphe) et groupés par (result_id, result_title)
  // pour la distribution. Appels via `supabase` (RLS owner-scoped).
  const [leadsDailyRes, leadsByResultRes] = await Promise.all([
    supabase.rpc("quiz_leads_daily", { p_user_id: user.id, p_quiz_id: quizId, p_tz_offset: tzOffset, p_since: period.sinceISO }),
    supabase.rpc("quiz_leads_by_result", { p_user_id: user.id, p_quiz_id: quizId, p_since: period.sinceISO }),
  ]);
  if (leadsByResultRes.error) {
    return NextResponse.json(
      { ok: false, error: leadsByResultRes.error.message },
      { status: 400 },
    );
  }
  const leadsDailyRows = (leadsDailyRes.data ?? []) as { day: string; n: number }[];
  const leadsByResultRows = (leadsByResultRes.data ?? []) as {
    result_id: string | null;
    result_title: string | null;
    n: number;
  }[];
  const leadsCount = lifetimeLeadsCount ?? 0;
  const exportedSio = lifetimeExportedSio ?? 0;

  // ── B) VUES + COMPLÉTIONS lifetime — double source réconciliée ──
  const [viewsCountRes, completionsCountRes] = await Promise.all([
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "view"),
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "complete"),
  ]);
  const viewsFromEvents = viewsCountRes.error ? 0 : viewsCountRes.count ?? 0;
  const completesFromEvents = completionsCountRes.error ? 0 : completionsCountRes.count ?? 0;
  const trackedViews = Math.max(quiz.views_count ?? 0, viewsFromEvents);
  const completionsCount = Math.max(quiz.completions_count ?? 0, completesFromEvents);

  // ── C) Taux de capture HONNÊTE ──
  const viewsReliable = trackedViews >= leadsCount;
  const viewsCount = Math.max(trackedViews, leadsCount);
  const captureRate =
    viewsReliable && viewsCount > 0
      ? Math.round((leadsCount / viewsCount) * 1000) / 10
      : null;

  // ─── Distribution par résultat (refonte Gwenn 8 juin 2026) ──────────
  // Bene 8 juin (DRAME final) : "je veux que mes users voient leur quiz
  // EXISTANT, en temps reel, pas des anciennes versions ou des versions
  // tronquees". Concretement :
  //   - tous les profils actuels visibles (meme a 0 lead) - drame compte 1
  //   - aucun ancien nom de profil affiche - drame compte 2
  //   - aucun bucket "Anciens profils" non plus (Bene n'en veut pas)
  //
  // Algo :
  //   1. Seed byTitle avec TOUS les profils current de quiz_results
  //      (count = 0 inclus) -> source de verite = le quiz actuel.
  //   2. Pour chaque bucket de leads, tenter de matcher a un profil
  //      current via id-live OU snapshot-title-qui-existe-encore.
  //      Les leads orphelins (ancien nom + renomme depuis, ou result
  //      supprime) sont silencieusement EXCLUS du donut.
  //   3. Pourcentages calcules sur le total des leads MATCHES (somme =
  //      100% strictement) - sinon le donut affiche 95% avec gap
  //      visuel, pire UX que la verite.
  //   4. Sort par count desc, pas de filtre zero (profils a 0 affiches).
  const { data: currentResults } = await supabaseAdmin
    .from("quiz_results")
    .select("id, title")
    .eq("quiz_id", quizId);
  const currentTitleById = new Map<string, string>(
    (currentResults ?? []).map((r) => [r.id as string, (r.title as string) ?? ""]),
  );

  // Resolution LIGNE PAR LIGNE (le RPC groupe deja par
  // (result_id, result_title)). BUG CORRIGE (drame Adeline 16 juillet) :
  // avant, tous les leads a result_id null etaient regroupes sous une cle
  // unique et TOUT le paquet attribue au PREMIER titre-snapshot vu -> il
  // basculait d'un profil a l'autre. Desormais chaque snapshot garde son
  // compte. Match sur le titre NORMALISE (stripHtml) pour reunir les leads
  // captes sous des mises en forme differentes du meme profil. Affichage :
  // titre courant BRUT (la page gere le HTML).
  const byTitle = new Map<string, number>(); // cle = titre courant brut (affichage)
  const normToRaw = new Map<string, string>(); // titre normalise -> titre courant brut
  for (const r of currentResults ?? []) {
    const raw = ((r.title as string) ?? "").trim();
    if (!raw) continue;
    const key = stripHtml(raw);
    if (!key) continue;
    if (!byTitle.has(raw)) byTitle.set(raw, 0);
    if (!normToRaw.has(key)) normToRaw.set(key, raw);
  }

  for (const row of leadsByResultRows) {
    const n = Number(row.n) || 0;
    if (n <= 0) continue;
    let raw: string | undefined;
    if (row.result_id) {
      const live = currentTitleById.get(row.result_id);
      if (live) raw = normToRaw.get(stripHtml(live));
    }
    if (!raw && row.result_title) raw = normToRaw.get(stripHtml(row.result_title));
    if (raw) byTitle.set(raw, (byTitle.get(raw) ?? 0) + n);
    // sinon: orphelin / ancien nom -> exclu du donut.
  }

  // Total des leads MATCHES (denominateur du %). Si tout est orphan,
  // matchedTotal = 0 et tous les profils a 0% (donut vide, OK).
  let matchedTotal = 0;
  for (const v of byTitle.values()) matchedTotal += v;

  const resultDistribution = Array.from(byTitle.entries())
    .map(([title, count]) => ({
      title,
      count,
      pct: matchedTotal > 0 ? Math.round((count / matchedTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── VUES quotidiennes (demande Gwenn 29 juin 2026) ──
  // Source FIABLE : quiz_events (event_type='view'), agrégé DANS la base via
  // la RPC daily_quiz_views (GROUP BY jour). Aucun plafond : que le quiz ait
  // 1 000 ou 10 millions de vues, on ne récupère qu'une ligne par jour. Le
  // bucketing jour-local (p_tz_offset) reproduit dateKeyForOffset à l'identique
  // côté SQL → ligne "vues" alignée sur "inscrits" + conversion par jour.
  const { data: viewsDailyRaw } = await supabaseAdmin.rpc("daily_quiz_views", {
    p_quiz_id: quizId,
    p_tz_offset: tzOffset,
    p_since: period.sinceISO,
  });
  const viewsDaily = (viewsDailyRaw ?? []) as { day: string; views: number }[];
  const viewsDayMap = new Map<string, number>();
  for (const r of viewsDaily) {
    viewsDayMap.set(r.day, Number(r.views) || 0);
  }
  const viewDayKeys = [...viewsDayMap.keys()].sort();

  // Série quotidienne : leads ET vues, déjà agrégés par jour LOCAL en SQL
  // (même formule dateKeyForOffset). Fill des jours manquants à 0.
  const leadsDayMap = new Map<string, number>();
  for (const r of leadsDailyRows) {
    leadsDayMap.set(r.day, (leadsDayMap.get(r.day) ?? 0) + Number(r.n));
  }
  const leadDayKeys = [...leadsDayMap.keys()].sort();
  const leadsByDay = (() => {
    if (leadDayKeys.length === 0 && viewDayKeys.length === 0) return [];
    const firstTimes: number[] = [];
    if (leadDayKeys.length) firstTimes.push(new Date(leadDayKeys[0]! + "T00:00:00Z").getTime());
    if (viewDayKeys.length) firstTimes.push(new Date(viewDayKeys[0]! + "T00:00:00Z").getTime());
    const startMs = period.sinceISO
      ? new Date(period.sinceISO).getTime()
      : firstTimes.length
        ? Math.min(...firstTimes)
        : Date.now();
    const out: { date: string; count: number; views: number }[] = [];
    const endKey = dateKeyForOffset(new Date(), tzOffset);
    let t = startMs;
    let seen = "";
    const guard = Date.now() + 24 * 3600 * 1000;
    while (t <= guard) {
      const k = dateKeyForOffset(new Date(t), tzOffset);
      if (k !== seen) {
        out.push({ date: k, count: leadsDayMap.get(k) ?? 0, views: viewsDayMap.get(k) ?? 0 });
        seen = k;
      }
      if (k === endKey) break;
      t += 24 * 3600 * 1000;
    }
    return out.slice(-365);
  })();

  // captureRate déjà calculé plus haut (honnête, nullable). exportRate =
  // % des leads taggés dans SIO (lifetime, cohérent avec les KPI).
  const exportRate =
    leadsCount > 0
      ? Math.round((exportedSio / leadsCount) * 1000) / 10
      : 0;

  // ── Funnel: drop-off per question ──
  // We count distinct sessions that VIEWED each question. Drop-off
  // between Q[n] and Q[n+1] = (views[n] - views[n+1]) / views[n].
  // The ratio is enough to flag the worst-performing question; we
  // expose absolute counts too so the UI can show "47% on Q3".
  const funnel: {
    questionIndex: number;
    views: number;
    answers: number;
    dropFromPrevious: number;
  }[] = [];
  let totalSessions = 0;
  try {
    // Funnel agrégé DANS la base (RPC), sans plafond (avant : cap 50000).
    // La RPC renvoie, par question_index croissant, views (MONOTONE :
    // sessions ayant atteint la question) + answers (sessions distinctes
    // ayant répondu). Aligné sur Tiquiz : la courbe ne remonte jamais.
    const { data: funnelRows } = await supabaseAdmin.rpc("quiz_question_funnel_detail", {
      p_quiz_id: quizId,
      p_since: period.sinceISO,
    });
    const rows = (funnelRows ?? []) as {
      question_index: number;
      views: number;
      answers: number;
    }[];

    let prevViews = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const v = Number(r.views);
      const drop =
        i === 0 || prevViews === 0
          ? 0
          : Math.round(((prevViews - v) / prevViews) * 1000) / 10;
      funnel.push({
        questionIndex: r.question_index,
        views: v,
        answers: Number(r.answers),
        dropFromPrevious: Math.max(0, drop),
      });
      prevViews = v;
    }
    totalSessions = funnel[0]?.views ?? 0;
  } catch (e) {
    // Table/RPC might not exist yet on a fresh deploy — fail-open with
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
      // LIFETIME, source réconciliée max(compteur dénormalisé, quiz_events).
      viewsCount,
      completionsCount,
      leadsCount,
      exportedSioCount: exportedSio,
      // captureRate NULL quand vues incomplètes → UI affiche "—" + note.
      captureRate,
      // viewsReliable false = leads captés sans vue trackée (embarqué/
      // funnel/antérieur au tracking). Taux non fiable.
      viewsReliable,
      exportRate,
    },
    resultDistribution,
    leadsByDay,
    funnel,
    totalFunnelSessions: totalSessions,
  });
}
