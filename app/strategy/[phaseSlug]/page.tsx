// app/strategy/[phaseSlug]/page.tsx
// Phase detail page with Trello-style task cards.
// Accessible from /strategy only (no sidebar link).

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import PhaseTaskBoard from "@/components/strategy/PhaseTaskBoard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnyRecord = Record<string, unknown>;

function isRecord(x: unknown): x is AnyRecord {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

const PHASE_CONFIG: Record<string, { key: "p1" | "p2" | "p3"; index: number; planKeys: string[] }> = {
  fondations: { key: "p1", index: 0, planKeys: ["d30", "month_1", "weeks_1_4", "phase_1"] },
  croissance: { key: "p2", index: 1, planKeys: ["d60", "month_2", "weeks_5_8", "phase_2"] },
  scale: { key: "p3", index: 2, planKeys: ["d90", "month_3", "weeks_9_12", "phase_3"] },
};

const PHASE_TITLES: Record<string, string> = {
  fondations: "Phase 1 : Fondations",
  croissance: "Phase 2 : Croissance",
  scale: "Phase 3 : Scale",
};

const PHASE_PERIODS: Record<string, string> = {
  fondations: "Poser les bases",
  croissance: "Développer son audience",
  scale: "Automatiser et scaler",
};

export default async function PhaseDetailPage({
  params,
}: {
  params: Promise<{ phaseSlug: string }>;
}) {
  const { phaseSlug } = await params;
  const config = PHASE_CONFIG[phaseSlug];

  if (!config) {
    redirect("/strategy");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const projectId = await getActiveProjectId(supabase, auth.user.id);

  // Fetch plan JSON for phase assignment
  const { data: bpRow } = await supabaseAdmin
    .from("business_plan")
    .select("plan_json")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planJson = (bpRow?.plan_json ?? {}) as AnyRecord;

  // Build title→phase mapping from plan
  const plan90 =
    (isRecord((planJson as AnyRecord)?.plan_90_days) ? (planJson as AnyRecord).plan_90_days as AnyRecord : null) ||
    (isRecord((planJson as AnyRecord)?.plan90) ? (planJson as AnyRecord).plan90 as AnyRecord : null) ||
    (isRecord((planJson as AnyRecord)?.plan_90) ? (planJson as AnyRecord).plan_90 as AnyRecord : null);

  const tbf =
    (plan90 && isRecord(plan90.tasks_by_timeframe) ? plan90.tasks_by_timeframe as AnyRecord : null) ||
    (isRecord((planJson as AnyRecord)?.tasks_by_timeframe) ? (planJson as AnyRecord).tasks_by_timeframe as AnyRecord : null);

  const phaseTitles = new Set<string>();
  if (tbf) {
    for (const k of config.planKeys) {
      const arr = Array.isArray(tbf[k]) ? tbf[k] as unknown[] : [];
      for (const item of arr) {
        const title = isRecord(item)
          ? (asString((item as AnyRecord).title) || asString((item as AnyRecord).task) || asString((item as AnyRecord).name))
          : typeof item === "string" ? item : null;
        if (title) {
          phaseTitles.add(title.trim().toLowerCase().replace(/\s+/g, " "));
        }
      }
    }
  }

  // Also build the set of ALL titles in other phases (to exclude them)
  const otherPhaseTitles = new Set<string>();
  if (tbf) {
    for (const [slug, cfg] of Object.entries(PHASE_CONFIG)) {
      if (slug === phaseSlug) continue;
      for (const k of cfg.planKeys) {
        const arr = Array.isArray(tbf[k]) ? tbf[k] as unknown[] : [];
        for (const item of arr) {
          const title = isRecord(item)
            ? (asString((item as AnyRecord).title) || asString((item as AnyRecord).task) || asString((item as AnyRecord).name))
            : typeof item === "string" ? item : null;
          if (title) {
            otherPhaseTitles.add(title.trim().toLowerCase().replace(/\s+/g, " "));
          }
        }
      }
    }
  }

  // Fetch enriched tasks with tags and subtask counts
  let taskQuery = supabaseAdmin
    .from("project_tasks")
    .select(`
      id, title, description, status, priority, due_date, estimated_duration, source, position, phase,
      task_tag_assignments(tag_id, task_tags(id, name, color)),
      task_subtasks(id, is_done)
    `)
    .eq("user_id", auth.user.id)
    .is("deleted_at", null);

  if (projectId) taskQuery = taskQuery.eq("project_id", projectId);

  const { data: rawTasks } = await taskQuery
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  // Filter tasks belonging to this phase
  const phaseTasks = (rawTasks ?? []).filter((t: AnyRecord) => {
    // Explicit phase column takes precedence over title-based matching
    const explicitPhase = t.phase as string | null;
    if (explicitPhase) {
      return explicitPhase === config.key;
    }
    const normalized = ((t.title as string) ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (phaseTitles.has(normalized)) return true;
    if (otherPhaseTitles.has(normalized)) return false;
    // Default: fondations gets unmatched tasks
    return phaseSlug === "fondations";
  });

  // Transform to TaskCardData
  const tasks = phaseTasks.map((t: AnyRecord) => {
    const tagAssignments = Array.isArray(t.task_tag_assignments)
      ? t.task_tag_assignments as AnyRecord[]
      : [];
    const tags = tagAssignments
      .map((ta) => (ta.task_tags as AnyRecord) ?? null)
      .filter(Boolean)
      .map((tag) => ({
        id: String((tag as AnyRecord).id),
        name: String((tag as AnyRecord).name),
        color: String((tag as AnyRecord).color),
      }));

    const subtasks = Array.isArray(t.task_subtasks) ? t.task_subtasks as AnyRecord[] : [];
    const subtasksDone = subtasks.filter((s) => s.is_done === true).length;

    return {
      id: String(t.id),
      title: (t.title as string) || "—",
      description: (t.description as string) || null,
      status: (t.status as string) || "todo",
      priority: (t.priority as string) || null,
      due_date: (t.due_date as string) || null,
      estimated_duration: (t.estimated_duration as string) || null,
      tags,
      subtasks_total: subtasks.length,
      subtasks_done: subtasksDone,
    };
  });

  const phaseTitle = PHASE_TITLES[phaseSlug] || phaseSlug;
  const phasePeriod = PHASE_PERIODS[phaseSlug] || "";

  // Phase description from i18n will be resolved client-side
  // We pass the phaseSlug to let the client component resolve it
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader
            left={<h1 className="text-lg font-display font-bold truncate">{phaseTitle}</h1>}
          />
          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            <PhaseTaskBoard
              phaseTitle={phaseTitle}
              phaseDescription=""
              phasePeriod={phasePeriod}
              phaseSlug={phaseSlug}
              tasks={tasks}
            />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
