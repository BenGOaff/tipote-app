// app/strategy/page.tsx
// Wrapper server minimal — UI 1:1 dans StrategyLovable (client)
// ✅ Tolérant si le plan n'est pas encore prêt : on affiche un état "génération en cours"
//    au lieu de redirect vers /strategy/pyramids.

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

function formatNumberFR(n: number): string {
  try {
    return new Intl.NumberFormat("fr-FR").format(n);
  } catch {
    return String(n);
  }
}

function hasCurrencyOrPeriodHints(s: string): boolean {
  const t = s.toLowerCase();
  return (
    t.includes("€") ||
    t.includes("eur") ||
    t.includes("euro") ||
    t.includes("/mois") ||
    t.includes("mois") ||
    t.includes("mensuel") ||
    t.includes("mensuelle") ||
    t.includes("par mois")
  );
}

/**
 * Normalise un objectif revenu *texte* venant du plan_json OU onboarding.
 * - supporte: "10k", "10K€/mois", "15 000", "2000-5000", "10000+"
 * - si pas de nombre exploitable => renvoie le texte clean (pour ne pas afficher "—")
 */
function normalizeRevenueGoalText(raw: unknown): { kind: "numeric" | "text"; value: string } {
  const s0 = asString(raw).trim();
  if (!s0) return { kind: "text", value: "" };

  const s = s0.replace(/\s+/g, " ").trim();

  const kmMatch = s.match(/(\d+(?:[.,]\d+)?)\s*([kKmM])\b/);
  if (kmMatch) {
    const numRaw = kmMatch[1].replace(",", ".");
    const mult = kmMatch[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    const n = Number(numRaw);
    if (Number.isFinite(n)) {
      const v = Math.round(n * mult);
      return { kind: "numeric", value: formatNumberFR(v) };
    }
  }

  const rangeMatch = s.match(/(\d[\d\s.,]*)\s*[-–]\s*(\d[\d\s.,]*)/);
  if (rangeMatch) {
    const b = rangeMatch[2].replace(/[^\d]/g, "");
    const n = Number(b);
    if (Number.isFinite(n) && n > 0) {
      return { kind: "numeric", value: formatNumberFR(n) };
    }
  }

  const digits = s.replace(/[^\d]/g, "");
  if (digits) {
    const n = Number(digits);
    if (Number.isFinite(n) && n > 0) {
      return { kind: "numeric", value: formatNumberFR(n) };
    }
    return { kind: "text", value: digits };
  }

  return { kind: "text", value: s.slice(0, 80) };
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

  // ✅ Guard onboarding : évite les boucles "onboarding ↔ stratégie"
  const { data: onboardingRow, error: onboardingError } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (onboardingError || !onboardingRow?.onboarding_completed) {
    redirect("/onboarding");
  }

  // ✅ business_profiles : on lit ce qui est utile même si le plan n'est pas encore prêt
  const profileRes = await supabase
    .from("business_profiles")
    .select(
      [
        "first_name",
        "content_preference",
        "revenue_goal_monthly",
        "offers",
        "has_offers",
        "is_affiliate",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRow = (profileRes.data ?? null) as AnyRecord | null;
  const firstName = asString(profileRow?.first_name);
  const preferredContentTypes = asStringArray(profileRow?.content_preference);

  // ✅ Pyramides d'offres : UNIQUEMENT pour les users SANS offres et NON affiliés (sinon: jamais de /strategy/pyramids)
  let isAffiliate = Boolean((profileRow as AnyRecord | null)?.is_affiliate);

  // Aligne la détection affiliation avec l'API /api/strategy/offer-pyramid (best-effort)
  try {
    const { data: bmRow } = await supabase
      .from("onboarding_facts")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "business_model")
      .maybeSingle();

    const bm = asString((bmRow as AnyRecord | null)?.value).toLowerCase();
    if (bm.includes("affiliate") || bm.includes("affilié") || bm.includes("affiliation")) isAffiliate = true;
  } catch {
    // fail-open
  }

  const offersArr = Array.isArray((profileRow as AnyRecord | null)?.offers) ? (((profileRow as AnyRecord | null)?.offers) as any[]) : [];
  const hasOffersEffective = Boolean((profileRow as AnyRecord | null)?.has_offers) || offersArr.length > 0;
  const shouldGeneratePyramids = !isAffiliate && !hasOffersEffective;

  // Plan
  const planRes = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const planRow = (planRes.data ?? null) as AnyRecord | null;
  const planJson = ((planRow?.plan_json ?? {}) as AnyRecord) || {};

  const planExistsAndReadable = !planRes.error && !!planRow;
  const planJsonHasContent = !!Object.keys(planJson).length;

  // ✅ Si le plan n'existe pas (ou pas encore prêt) => afficher état “génération”
  if (!planExistsAndReadable || !planJsonHasContent) {
    const fromProfile = normalizeRevenueGoalText(profileRow?.revenue_goal_monthly);
    const picked = fromProfile.value ? fromProfile : { kind: "text", value: "" as string };

    const revenueGoal =
      picked.value && picked.kind === "numeric"
        ? `${picked.value} € / mois`
        : picked.value && hasCurrencyOrPeriodHints(picked.value)
          ? picked.value
          : picked.value
            ? `${picked.value} € / mois`
            : "—";

    return (
      <StrategyLovable
        mode="generating"
        firstName={firstName}
        revenueGoal={revenueGoal}
        horizon="90 jours"
        progressionPercent={0}
        totalDone={0}
        totalAll={0}
        daysRemaining={90}
        currentPhase={1}
        currentPhaseLabel="Fondations"
        phases={[
          { title: "Phase 1 : Fondations", period: "Jours 1-30", tasks: [] },
          { title: "Phase 2 : Croissance", period: "Jours 31-60", tasks: [] },
          { title: "Phase 3 : Scale", period: "Jours 61-90", tasks: [] },
        ]}
        persona={{
          title: "",
          pains: [],
          desires: [],
          channels: preferredContentTypes.length ? preferredContentTypes : [],
        }}
        offerPyramids={[]}
        initialSelectedIndex={0}
        initialSelectedPyramid={undefined}
        planTasksCount={0}
      />
    );
  }

  // ✅ Sélection pyramide :
  // - On NE redirige JAMAIS vers /strategy/pyramids (route réservée à l'onboarding et aux users sans offres).
  // - Si une sélection existe dans le plan -> on l'utilise.
  // - Sinon, on fail-open en prenant la 1ère pyramide si dispo (sans bloquer l'accès à /strategy).
  const selectedIndexRaw = (planJson as AnyRecord).selected_offer_pyramid_index;
  const selectedIndex = typeof selectedIndexRaw === "number" ? (selectedIndexRaw as number) : null;

  // Persona (depuis plan_json)
  const personaRaw = ((planJson as AnyRecord).persona ?? {}) as AnyRecord;
  const persona = {
    title: asString(personaRaw.title) || asString(personaRaw.profile) || asString(personaRaw.name) || "",
    pains: asStringArray(personaRaw.pains),
    desires: asStringArray(personaRaw.desires),
    channels: preferredContentTypes.length ? preferredContentTypes : asStringArray(personaRaw.channels),
  };

  // Pyramides (depuis plan_json)
  const offerPyramids = (((planJson as AnyRecord).offer_pyramids ?? []) as AnyRecord[]) || [];

  const hasExplicitSelection =
    typeof (planJson as AnyRecord).selected_offer_pyramid_index === "number" && !!(planJson as AnyRecord).selected_offer_pyramid;

  // ✅ Index sélectionné : si pas de sélection explicite, on choisit 0 si on a des pyramides (sinon 0 par défaut)
  const initialSelectedIndex =
    hasExplicitSelection
      ? ((planJson as AnyRecord).selected_offer_pyramid_index as number)
      : offerPyramids.length > 0
        ? 0
        : 0;

  const initialSelectedPyramid =
    hasExplicitSelection
      ? ((planJson as AnyRecord).selected_offer_pyramid as AnyRecord)
      : offerPyramids.length > 0
        ? (offerPyramids[0] as AnyRecord)
        : undefined;

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

  const byPhase = { p1: [] as TaskRow[], p2: [] as TaskRow[], p3: [] as TaskRow[] };

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
  // 2) fallback à business_profiles.revenue_goal_monthly (onboarding)
  // 3) sinon "—"
  const fromPlan = normalizeRevenueGoalText((planJson as AnyRecord)?.revenue_goal);
  const fromProfile = normalizeRevenueGoalText(profileRow?.revenue_goal_monthly);

  const picked = fromPlan.value ? fromPlan : fromProfile;

  const revenueGoal =
    picked.value && picked.kind === "numeric"
      ? `${picked.value} € / mois`
      : picked.value && hasCurrencyOrPeriodHints(picked.value)
        ? picked.value
        : picked.value
          ? `${picked.value} € / mois`
          : "—";

  const horizon = "90 jours";
  const progressionPercent = Math.round(progressAll * 100);

  const planTasksCount = countPlanTasks(planJson);
  const totalPlanTasks = totalTasks || planTasksCount || 0;

  const currentPhase = byPhase.p1.length ? 1 : byPhase.p2.length ? 2 : byPhase.p3.length ? 3 : 1;
  const currentPhaseLabel = currentPhase === 1 ? "Fondations" : currentPhase === 2 ? "Croissance" : "Scale";

  // ✅ Jours restants : basé sur created_at du business_plan
  const createdAt = asString(planRow?.created_at);
  const createdDate = createdAt ? parseDateOnly(createdAt) : null;

  const daysElapsed = createdDate
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
