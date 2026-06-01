// app/api/quiz/[quizId]/survey-analysis/route.ts
//
// Analyse IA des résultats d'un sondage (Tipote).
//
//   GET  → renvoie l'analyse existante (si déjà générée), sans rien
//          débiter. Inclut un flag `canGenerate` + le coût.
//   POST → génère (ou re-génère) l'analyse.
//          - Minimum 5 réponses (SURVEY_AI_MIN_RESPONSES), sinon 422.
//          - Coûte 1 crédit IA à la PREMIÈRE génération seulement
//            (survey_ai_first_charged_at NULL). Les re-générations
//            ("mises à jour" après nouvelles réponses) sont GRATUITES.
//          - Stocke le résultat sur quizzes.survey_ai_analysis.
//
// Owner-scoped. Débit via consumeCredits (RPC consume_ai_credits) —
// même chemin que les autres features IA Tipote.

import { NextRequest, NextResponse } from "next/server";

import { consumeCredits } from "@/lib/credits";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  aggregateSurvey,
  generateSurveyAnalysis,
  SURVEY_AI_MIN_RESPONSES,
} from "@/lib/survey/analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function loadOwnedSurvey(quizId: string, userId: string) {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, mode, survey_ai_analysis, survey_ai_analysis_at, survey_ai_first_charged_at")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;
  return quiz;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const quiz = await loadOwnedSurvey(quizId, user.id);
  if (!quiz) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const aggregate = await aggregateSurvey(quizId, user.id);
  const totalResponses = aggregate?.totalResponses ?? 0;
  const hasEnough = totalResponses >= SURVEY_AI_MIN_RESPONSES;
  // 1er passage = payant (1 crédit). Re-génération = gratuite.
  const cost = quiz.survey_ai_first_charged_at ? 0 : 1;

  return NextResponse.json({
    ok: true,
    analysis: quiz.survey_ai_analysis ?? null,
    analysisAt: quiz.survey_ai_analysis_at ?? null,
    totalResponses,
    minResponses: SURVEY_AI_MIN_RESPONSES,
    hasEnough,
    cost,
  });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const quiz = await loadOwnedSurvey(quizId, user.id);
  if (!quiz) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const aggregate = await aggregateSurvey(quizId, user.id);
  if (!aggregate) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (aggregate.totalResponses < SURVEY_AI_MIN_RESPONSES) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_ENOUGH_RESPONSES",
        message: "Il n'y a pas assez de réponses pour une analyse pertinente.",
        totalResponses: aggregate.totalResponses,
        minResponses: SURVEY_AI_MIN_RESPONSES,
      },
      { status: 422 },
    );
  }

  // Débit crédit UNIQUEMENT à la 1ère génération. On débite AVANT de
  // générer pour ne pas offrir l'analyse en cas de solde insuffisant ;
  // si la génération échoue ensuite, on a documenté le pattern (le
  // crédit est consommé mais l'user peut re-générer gratuitement après,
  // puisque first_charged_at sera posé — acceptable et simple).
  const isFirst = !quiz.survey_ai_first_charged_at;
  if (isFirst) {
    try {
      await consumeCredits(user.id, 1, {
        reason: "survey_ai_analysis",
        quiz_id: quizId,
      });
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === "NO_CREDITS") {
        return NextResponse.json(
          {
            ok: false,
            error: "NO_CREDITS",
            message: "Tu n'as plus de crédits IA. Recharge pour lancer l'analyse.",
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "credit_error" },
        { status: 500 },
      );
    }
  }

  let analysis;
  try {
    analysis = await generateSurveyAnalysis(aggregate, String(quiz.title ?? "Sondage"));
  } catch (err) {
    console.error("[survey-analysis] generation failed", err);
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: "L'analyse a échoué. Réessaie dans un instant." },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    survey_ai_analysis: analysis,
    survey_ai_analysis_at: nowIso,
  };
  if (isFirst) patch.survey_ai_first_charged_at = nowIso;

  const { error: updateErr } = await supabaseAdmin
    .from("quizzes")
    .update(patch)
    .eq("id", quizId);
  if (updateErr) {
    console.error("[survey-analysis] persist failed", updateErr.message);
    // L'analyse a été générée mais pas persistée ; on la renvoie quand
    // même au client pour ne pas perdre le crédit dépensé.
  }

  return NextResponse.json({ ok: true, analysis, analysisAt: nowIso });
}
