// app/api/insights/global/route.ts (Tipote)
//
// Analyse IA STRATÉGIQUE GLOBALE : compte-rendu de pilotage sur TOUS les
// quiz/sondages du user. Gate par CREDIT (1 credit a la 1ere generation,
// MAJ gratuites). Persistee dans user_insight_reports.
//
//   GET  -> rapport existant + flags (hasEnough, totals, cost).
//   POST -> genere/regenere si assez d'activite globale.

import { NextRequest, NextResponse } from "next/server";

import { consumeCredits } from "@/lib/credits";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  aggregateGlobalInsights,
  generateGlobalInsights,
  GLOBAL_MIN_LEADS,
} from "@/lib/insights/global";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function loadReport(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_insight_reports")
    .select("report, generated_at, first_charged_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [report, aggregate] = await Promise.all([loadReport(user.id), aggregateGlobalInsights(user.id)]);
  const totalLeads = aggregate?.totals.leads ?? 0;
  const r = report as { report?: unknown; generated_at?: string; first_charged_at?: string } | null;

  return NextResponse.json({
    ok: true,
    analysis: r?.report ?? null,
    analysisAt: r?.generated_at ?? null,
    totals: aggregate?.totals ?? null,
    hasEnough: totalLeads >= GLOBAL_MIN_LEADS,
    minLeads: GLOBAL_MIN_LEADS,
    cost: r?.first_charged_at ? 0 : 1,
  });
}

export async function POST(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const aggregate = await aggregateGlobalInsights(user.id);
  if (!aggregate) {
    return NextResponse.json(
      { ok: false, error: "NO_PROJECTS", message: "Cree au moins un quiz ou un sondage pour lancer l'analyse." },
      { status: 422 },
    );
  }
  if (aggregate.totals.leads < GLOBAL_MIN_LEADS) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_ENOUGH_DATA",
        message: `Pas assez d'activite pour une analyse fiable. Reviens quand tu auras au moins ${GLOBAL_MIN_LEADS} leads au total.`,
        totals: aggregate.totals,
      },
      { status: 422 },
    );
  }

  // Debit 1 credit a la 1ere generation seulement.
  const existing = await loadReport(user.id);
  const isFirst = !(existing as { first_charged_at?: string } | null)?.first_charged_at;
  if (isFirst) {
    try {
      await consumeCredits(user.id, 1, { reason: "global_ai_insights" });
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

  let report;
  try {
    report = await generateGlobalInsights(aggregate);
  } catch (err) {
    console.error("[insights/global] generation failed", err);
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: "L'analyse a echoue. Reessaie dans un instant." },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin.from("user_insight_reports").upsert(
    {
      user_id: user.id,
      report,
      generated_at: nowIso,
      updated_at: nowIso,
      ...(isFirst ? { first_charged_at: nowIso } : {}),
    },
    { onConflict: "user_id" },
  );
  if (upErr) console.error("[insights/global] persist failed", upErr.message);

  return NextResponse.json({ ok: true, analysis: report, analysisAt: nowIso });
}
