// app/api/strategy/revenue-goal/route.ts
// PATCH : met à jour le revenue_goal dans le plan_json du business_plan.
// Cela garantit que l'objectif de revenu persiste au rechargement de la page stratégie
// (qui lit en priorité plan_json.revenue_goal avant de fallback sur business_profiles).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const revenueGoal = (body?.revenue_goal as string | undefined)?.trim();

  if (!revenueGoal) {
    return NextResponse.json(
      { error: "revenue_goal manquant" },
      { status: 400 }
    );
  }

  // Fetch existing plan
  const { data: plan, error: planError } = await supabaseAdmin
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", user.id)
    .maybeSingle();

  if (planError || !plan) {
    // No plan yet — nothing to update, profile value will be used as fallback
    return NextResponse.json({ ok: true, updated: false });
  }

  // Merge revenue_goal into existing plan_json
  const planJson =
    plan.plan_json && typeof plan.plan_json === "object"
      ? (plan.plan_json as Record<string, unknown>)
      : {};

  planJson.revenue_goal = revenueGoal;

  const { error: updateError } = await supabaseAdmin
    .from("business_plan")
    .update({ plan_json: planJson })
    .eq("id", plan.id);

  if (updateError) {
    console.error(
      "[revenue-goal] update error:",
      updateError.message
    );
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, updated: true });
}
