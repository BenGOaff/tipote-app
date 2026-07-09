// app/api/quiz/[quizId]/insights/route.ts (Tipote)
//
// Analyse IA STRATÉGIQUE d'un quiz ou sondage (funnel, capture, profils,
// axes d'amelioration, actions ventes/captures). Distincte de
// survey-analysis (detail des reponses). Gate par CREDITS (modele
// Tipote) : 1 credit a la 1ere generation, mises a jour gratuites.
//
//   GET  -> analyse existante + flags (hasEnough, cost, seuils).
//   POST -> genere/regenere si assez d'activite. Debit 1er passage.

import { NextRequest, NextResponse } from "next/server";

import { consumeCredits } from "@/lib/credits";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  aggregateQuizInsights,
  generateQuizInsights,
  INSIGHTS_MIN_LEADS,
  INSIGHTS_MIN_VIEWS,
} from "@/lib/quiz/insights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function loadOwned(quizId: string, userId: string) {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, mode, ai_insights, ai_insights_at, ai_insights_first_charged_at")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;
  return quiz;
}

function hasEnough(a: { metrics: { leads: number; views: number } }): boolean {
  return a.metrics.leads >= INSIGHTS_MIN_LEADS || a.metrics.views >= INSIGHTS_MIN_VIEWS;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const quiz = await loadOwned(quizId, user.id);
  if (!quiz) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const aggregate = await aggregateQuizInsights(quizId, user.id);

  return NextResponse.json({
    ok: true,
    analysis: quiz.ai_insights ?? null,
    analysisAt: quiz.ai_insights_at ?? null,
    mode: aggregate?.mode ?? "quiz",
    metrics: aggregate?.metrics ?? null,
    hasEnough: aggregate ? hasEnough(aggregate) : false,
    minLeads: INSIGHTS_MIN_LEADS,
    minViews: INSIGHTS_MIN_VIEWS,
    // 1er passage payant (1 credit), re-generation gratuite.
    cost: quiz.ai_insights_first_charged_at ? 0 : 1,
  });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const quiz = await loadOwned(quizId, user.id);
  if (!quiz) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const aggregate = await aggregateQuizInsights(quizId, user.id);
  if (!aggregate) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (!hasEnough(aggregate)) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_ENOUGH_DATA",
        message: `Pas assez d'activite pour une analyse fiable. Reviens quand tu auras au moins ${INSIGHTS_MIN_LEADS} leads ou ${INSIGHTS_MIN_VIEWS} vues.`,
        metrics: aggregate.metrics,
      },
      { status: 422 },
    );
  }

  // Debit credit UNIQUEMENT a la 1ere generation (comme survey-analysis).
  const isFirst = !quiz.ai_insights_first_charged_at;
  if (isFirst) {
    try {
      await consumeCredits(user.id, 1, { reason: "quiz_ai_insights", quiz_id: quizId });
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === "NO_CREDITS") {
        return NextResponse.json(
          { ok: false, error: "NO_CREDITS", message: "Tu n'as plus de credits IA. Recharge pour lancer l'analyse." },
          { status: 402 },
        );
      }
      return NextResponse.json({ ok: false, error: "credit_error" }, { status: 500 });
    }
  }

  let analysis;
  try {
    analysis = await generateQuizInsights(aggregate);
  } catch (err) {
    console.error("[quiz/insights] generation failed", err);
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: "L'analyse a echoue. Reessaie dans un instant." },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { ai_insights: analysis, ai_insights_at: nowIso };
  if (isFirst) patch.ai_insights_first_charged_at = nowIso;

  const { error: upErr } = await supabaseAdmin.from("quizzes").update(patch).eq("id", quizId);
  if (upErr) console.error("[quiz/insights] persist failed", upErr.message);

  return NextResponse.json({ ok: true, analysis, analysisAt: nowIso });
}
