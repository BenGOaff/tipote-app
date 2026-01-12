// app/strategy/page.tsx
// Wrapper server minimal — UI 1:1 dans StrategyLovable (client)

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import StrategyLovable from "@/components/strategy/StrategyLovable";
import AutoSyncTasks from "./AutoSyncTasks";

type AnyRecord = Record<string, unknown>;

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(", ");
  return "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // support "a, b, c" ou "a|b|c"
    const parts = s.includes("|") ? s.split("|") : s.split(",");
    return parts.map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function parseDateOnly(raw: string): Date | null {
  if (!raw) return null;
  // accepte YYYY-MM-DD ou ISO
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bucketKey(daysFromNow: number) {
  if (daysFromNow <= 30) return "p1";
  if (daysFromNow <= 60) return "p2";
  if (daysFromNow <= 90) return "p3";
  return "p4";
}

function countPlanTasks(planJson: AnyRecord): number {
  const plan90 = (planJson.plan_90_days as AnyRecord) || (planJson.plan90 as AnyRecord);
  const grouped = (plan90?.tasks_by_timeframe as AnyRecord) || (planJson.tasks_by_timeframe as AnyRecord);
  if (!grouped) return 0;

  const d30 = Array.isArray(grouped.d30) ? grouped.d30.length : 0;
  const d60 = Array.isArray(grouped.d60) ? grouped.d60.length : 0;
  const d90 = Array.isArray(grouped.d90) ? grouped.d90.length : 0;

  return d30 + d60 + d90;
}

function normalizeRevenueGoalText(raw: unknown): string {
  /**
   Objectif revenu:
   - plan_json.revenue_goal (source de vérité côté stratégie)
   - fallback: business_profiles.revenue_goal_monthly (ajout onboarding)
   Valeur DB = texte, donc on:
   - garde les digits
   - formatte en fr-FR si possible
  */
  const s = asString(raw).trim();
  if (!s) return "";

  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return "";

  const n = Number(digits);
  if (!Number.isFinite(n)) return digits;

  try {
    return new Intl.NumberFormat("fr-FR").format(n);
  } catch {
    return String(n);
  }
}

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Plan
  const planRes = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (planRes.error) redirect("/onboarding");

  const planRow = (planRes.data ?? null) as AnyRecord | null;
  const planJson = (planRow?.plan_json ?? {}) as AnyRecord;

  if (!Object.keys(planJson).length) redirect("/onboarding");

  // ✅ si pas de pyramide choisie -> page Lovable de choix
  const selectedIndex = planJson.selected_offer_pyramid_index;
  if (selectedIndex === null || typeof selectedIndex === "undefined") {
    redirect("/strategy/pyramids");
  }

  // ✅ business_profiles : on lit uniquement ce dont l’UI a besoin
  const profileRes = await supabase
    .from("business_profiles")
    .select(
      [
        "first_name",
        "niche",
        "business_maturity",
        "main_goals",
        "content_preference",
        "revenue_goal_monthly",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRow = (profileRes.data ?? null) as AnyRecord | null;

  const firstName = asString(profileRow?.first_name);

  const goals = asStringArray(profileRow?.main_goals) || asStringArray(profileRow?.goals);

  const preferredContentTypes = asStringArray(profileRow?.content_preference);

  // Persona (depuis plan_json)
  const personaRaw = (planJson.persona ?? {}) as AnyRecord;
  const persona = {
    title: asString(personaRaw.title) || asString(personaRaw.profile) || asString(personaRaw.name) || "",
    pains: asStringArray(personaRaw.pains),
    desires: asStringArray(personaRaw.desires),
    channels: preferredContentTypes.length ? preferredContentTypes : asStringArray(personaRaw.channels),
  };

  // Pyramides (depuis plan_json)
  const offerPyramids = (planJson.offer_pyramids ?? []) as AnyRecord[];

  const hasExplicitSelection =
    typeof planJson.selected_offer_pyramid_index === "number" && !!planJson.selected_offer_pyramid;

  const initialSelectedIndex = hasExplicitSelection ? (planJson.selected_offer_pyramid_index as number) : 0;
  const initialSelectedPyramid = hasExplicitSelection ? (planJson.selected_offer_pyramid as AnyRecord) : undefined;

  // ✅ IMPORTANT (prod/RLS-safe):
  // Lecture des tâches via supabaseAdmin (service_role) car les policies RLS peuvent renvoyer [] sans erreur.
  // On filtre STRICTEMENT par user_id -> aucune fuite de données.
  const tasksRes = await supabaseAdmin
    .from("project_tasks")
    .select("id, title, status, priority, due_date, source, created_at, updated_at")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);

  const tasks = ((tasksRes.data ?? []) as unknown as TaskRow[]) ?? [];

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => (t.status ?? "").toLowerCase() === "done").length;
  const progressAll = totalTasks ? clamp01(doneTasks / totalTasks) : 0;

  const today = new Date();

  const byPhase = {
    p1: [] as TaskRow[],
    p2: [] as TaskRow[],
    p3: [] as TaskRow[],
  };

  for (const t of tasks) {
    const due = t.due_date ? parseDateOnly(t.due_date) : null;
    if (!due) continue;
    const daysFromNow = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const key = bucketKey(daysFromNow);
    if (key === "p1") byPhase.p1.push(t);
    if (key === "p2") byPhase.p2.push(t);
    if (key === "p3") byPhase.p3.push(t);
  }

  // ✅ Objectif revenu :
  // 1) priorité à plan_json.revenue_goal
  // 2) fallback à business_profiles.revenue_goal_monthly (tant que plan_json n’est pas enrichi)
  // 3) sinon "—"
  const revenueFromPlan = normalizeRevenueGoalText((planJson as AnyRecord)?.revenue_goal);
  const revenueFromProfile = normalizeRevenueGoalText(profileRow?.revenue_goal_monthly);

  const revenueGoal =
    revenueFromPlan
      ? `${revenueFromPlan} € / mois`
      : revenueFromProfile
        ? `${revenueFromProfile} € / mois`
        : "—";

  const horizon = "90 jours";
  const progressionPercent = Math.round(progressAll * 100);

  const planTasksCount = countPlanTasks(planJson);
  const totalPlanTasks = totalTasks || planTasksCount || 0;

  const currentPhase = byPhase.p1.length ? 1 : byPhase.p2.length ? 2 : byPhase.p3.length ? 3 : 1;
  const currentPhaseLabel = currentPhase === 1 ? "Fondations" : currentPhase === 2 ? "Croissance" : "Scale";

  // ✅ Jours restants : basé sur created_at du business_plan (approche stable, sans inventer d’autre date)
  const createdAt = asString(planRow?.created_at);
  const createdDate = createdAt ? parseDateOnly(createdAt) : null;

  const daysElapsed =
    createdDate
      ? Math.max(0, Math.floor((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  const daysRemaining = Math.max(0, 90 - daysElapsed);

  // ✅ Auto-sync côté CLIENT (safe)
  const shouldAutoSync = totalTasks === 0 && planTasksCount > 0;

  return (
    <>
      <AutoSyncTasks enabled={shouldAutoSync} />

      <StrategyLovable
        firstName={firstName}
        revenueGoal={revenueGoal}
        horizon={horizon}
        progressionPercent={progressionPercent}
        totalDone={doneTasks}
        totalAll={totalPlanTasks}
        daysRemaining={daysRemaining}
        currentPhase={currentPhase}
        currentPhaseLabel={currentPhaseLabel}
        phases={[
          { title: "Phase 1 : Fondations", period: "Jours 1-30", tasks: byPhase.p1 },
          { title: "Phase 2 : Croissance", period: "Jours 31-60", tasks: byPhase.p2 },
          { title: "Phase 3 : Scale", period: "Jours 61-90", tasks: byPhase.p3 },
        ]}
        persona={persona}
        offerPyramids={offerPyramids}
        initialSelectedIndex={initialSelectedIndex}
        initialSelectedPyramid={initialSelectedPyramid}
        planTasksCount={planTasksCount}
      />
    </>
  );
}
