// app/api/coach/score/route.ts
// Business maturity score (0-100)
// Calculates a score based on completeness of business profile, offers, persona,
// tasks activity, content production, and coaching engagement.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoreDimension = {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
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

    const tasksQuery = projectFilter(
      supabase
        .from("project_tasks")
        .select("id, status, due_date, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null),
    );

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

    const [bpRes, tasksRes, contentsRes, offersRes, coachRes, personaRes] = await Promise.all([
      bpQuery.maybeSingle(),
      tasksQuery.limit(100),
      contentsQuery.limit(100),
      offersQuery.limit(10),
      coachQuery.order("created_at", { ascending: false }).limit(50),
      personaQuery,
    ]);

    const bp = bpRes.data as any;
    const tasks = tasksRes.data ?? [];
    const contents = contentsRes.data ?? [];
    const offers = offersRes.data ?? [];
    const coachMsgs = coachRes.data ?? [];
    const persona = (personaRes.data ?? [])[0] as any;

    const dimensions: ScoreDimension[] = [];

    // 1. Business Profile completeness (20%)
    const bpFields = ["business_name", "niche", "target_audience", "mission", "vision"];
    const bpFilled = bpFields.filter((f) => bp?.[f] && String(bp[f]).trim().length > 2).length;
    const bpScore = Math.round((bpFilled / bpFields.length) * 100);
    dimensions.push({
      key: "profile",
      label: "Business Profile",
      score: bpScore,
      weight: 20,
      detail: `${bpFilled}/${bpFields.length} fields completed`,
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
