// app/api/coach/score/route.ts
// Business maturity score (0-100)
// Calculates a score based on completeness of business profile, offers, persona,
// tasks activity, content production, and coaching engagement.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoreDimension = {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
  meta?: Record<string, number>;
};

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    // Fetch all dimensions in parallel
    // Use or() to include rows with matching project_id OR null project_id
    // (data created before project system was added has project_id = null)
    const projectFilter = (q: any) =>
      projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q;

    const bpQuery = projectFilter(
      supabase.from("business_profiles").select("*").eq("user_id", user.id),
    );

    // ✅ Use supabaseAdmin for tasks (RLS on project_tasks can return [] silently)
    const tasksQueryAdmin = supabaseAdmin
      .from("project_tasks")
      .select("id, status, due_date, updated_at")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const contentsQuery = projectFilter(
      supabase
        .from("content_item")
        .select("id, status:statut, created_at")
        .eq("user_id", user.id),
    );

    const offersQuery = projectFilter(
      supabase
        .from("offer_pyramids")
        .select("id, name, level, price_min")
        .eq("user_id", user.id),
    );

    const planQuery = projectFilter(
      supabase.from("business_plan").select("plan_json").eq("user_id", user.id),
    );

    const coachQuery = projectFilter(
      supabase
        .from("coach_messages")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("role", "user"),
    );

    const personaQuery = supabase
      .from("personas")
      .select("id, pains, desires, persona_json")
      .eq("user_id", user.id)
      .eq("role", "client_ideal")
      .limit(1);

    const [bpRes, tasksRes, contentsRes, offersRes, planRes, coachRes, personaRes] = await Promise.all([
      bpQuery.maybeSingle(),
      tasksQueryAdmin.limit(100),
      contentsQuery.limit(100),
      offersQuery.limit(10),
      planQuery.maybeSingle(),
      coachQuery.order("created_at", { ascending: false }).limit(50),
      personaQuery,
    ]);

    const bp = bpRes.data as any;
    const tasks = tasksRes.data ?? [];
    const contents = contentsRes.data ?? [];
    let offers = offersRes.data ?? [];
    const coachMsgs = coachRes.data ?? [];
    const persona = (personaRes.data ?? [])[0] as any;

    // Fallback: extract offers from business_plan.plan_json if offer_pyramids is empty
    if (offers.length === 0) {
      const planJson = (planRes.data as any)?.plan_json;
      if (planJson) {
        const selected =
          planJson?.selected_pyramid ??
          planJson?.pyramid?.selected_pyramid ??
          planJson?.pyramid ??
          planJson?.offer_pyramid ??
          null;
        if (selected && typeof selected === "object") {
          const levels: Array<[string, string]> = [
            ["lead_magnet", "lead_magnet"], ["free", "lead_magnet"],
            ["low_ticket", "low_ticket"],
            ["middle_ticket", "middle_ticket"],
            ["high_ticket", "high_ticket"], ["premium", "high_ticket"],
          ];
          const planOffers: any[] = [];
          for (const [key, level] of levels) {
            const o = (selected as any)[key];
            if (o && typeof o === "object") {
              planOffers.push({
                id: key,
                name: o.name ?? o.title ?? key,
                level,
                price_min: typeof o.price === "number" ? o.price : (typeof o.price_min === "number" ? o.price_min : null),
              });
            }
          }
          if (planOffers.length > 0) offers = planOffers;
        }
      }
    }

    // Also check business_profiles.offers as additional source
    if (offers.length === 0 && Array.isArray(bp?.offers)) {
      offers = (bp.offers as any[])
        .filter((o: any) => o && typeof o === "object" && (o.name || o.title))
        .map((o: any, i: number) => ({
          id: `bp-${i}`,
          name: o.name ?? o.title ?? "Offre",
          level: o.level ?? "user_offer",
          price_min: typeof o.price === "number" ? o.price : null,
        }));
    }

    const dimensions: ScoreDimension[] = [];

    // 1. Business Profile completeness (20%)
    // Check fields that actually exist in the business_profiles table
    const bpFields = ["first_name", "niche", "mission", "main_goal", "business_maturity"];
    const bpFilled = bpFields.filter((f) => bp?.[f] && String(bp[f]).trim().length > 2).length;
    const bpScore = Math.round((bpFilled / bpFields.length) * 100);
    dimensions.push({
      key: "profile",
      label: "Business Profile",
      score: bpScore,
      weight: 20,
      detail: `${bpFilled}/${bpFields.length} fields completed`,
      meta: { filled: bpFilled, total: bpFields.length },
    });

    // 2. Persona clarity (15%)
    let personaScore = 0;
    if (persona) {
      personaScore += 30; // exists
      if (persona.pains && Array.isArray(persona.pains) && persona.pains.length > 0) personaScore += 25;
      if (persona.desires && Array.isArray(persona.desires) && persona.desires.length > 0) personaScore += 25;
      if (persona.persona_json && typeof persona.persona_json === "object") personaScore += 20;
    }
    dimensions.push({
      key: "persona",
      label: "Persona",
      score: Math.min(100, personaScore),
      weight: 15,
      detail: persona ? "Persona defined" : "No persona yet",
      meta: { defined: persona ? 1 : 0 },
    });

    // 3. Offer structure (20%)
    let offerScore = 0;
    if (offers.length > 0) {
      offerScore += 30;
      const levels = new Set((offers as any[]).map((o) => o.level));
      if (levels.size >= 2) offerScore += 25;
      if (levels.size >= 3) offerScore += 20;
      const hasPrice = (offers as any[]).some((o) => o.price_min && o.price_min > 0);
      if (hasPrice) offerScore += 25;
    }
    dimensions.push({
      key: "offers",
      label: "Offer Structure",
      score: Math.min(100, offerScore),
      weight: 20,
      detail: `${offers.length} offer(s) defined`,
      meta: { count: offers.length },
    });

    // 4. Task execution (20%)
    const totalTasks = tasks.length;
    const doneTasks = (tasks as any[]).filter((t) => t.status === "done").length;
    const taskScore = totalTasks === 0
      ? 0
      : Math.round((doneTasks / totalTasks) * 80 + (totalTasks >= 5 ? 20 : (totalTasks / 5) * 20));
    dimensions.push({
      key: "execution",
      label: "Execution",
      score: Math.min(100, taskScore),
      weight: 20,
      detail: `${doneTasks}/${totalTasks} tasks completed`,
      meta: { done: doneTasks, total: totalTasks },
    });

    // 5. Content production (15%)
    const publishedContents = (contents as any[]).filter((c) => c.status === "published" || c.status === "scheduled").length;
    const contentScore = Math.min(100, contents.length >= 10 ? 50 + Math.min(50, publishedContents * 10) : contents.length * 10);
    dimensions.push({
      key: "content",
      label: "Content",
      score: contentScore,
      weight: 15,
      detail: `${contents.length} items, ${publishedContents} published/scheduled`,
      meta: { items: contents.length, published: publishedContents },
    });

    // 6. Coaching engagement (10%)
    const last7d = new Date();
    last7d.setDate(last7d.getDate() - 7);
    const recentCoach = (coachMsgs as any[]).filter(
      (m) => m.created_at && new Date(m.created_at) >= last7d,
    ).length;
    const coachScore = Math.min(100, recentCoach * 20);
    dimensions.push({
      key: "coaching",
      label: "Coaching",
      score: coachScore,
      weight: 10,
      detail: `${recentCoach} messages this week`,
      meta: { count: recentCoach },
    });

    // Weighted total
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const totalScore = Math.round(
      dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight,
    );

    // Level label
    const level =
      totalScore >= 80 ? "expert" :
      totalScore >= 60 ? "advanced" :
      totalScore >= 40 ? "intermediate" :
      totalScore >= 20 ? "beginner" :
      "starter";

    return NextResponse.json(
      { ok: true, score: totalScore, level, dimensions },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
