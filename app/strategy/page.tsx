// app/strategy/page.tsx

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { ReactNode } from "react";
import StrategyClient from "./StrategyClient";

type AnyRecord = Record<string, any>;

type Task = {
  title?: string;
  description?: string;
  status?: string;
  importance?: "low" | "medium" | "high" | string;
  due_date?: string;
  dueDate?: string;
  timeframe?: string; // ex: "30d", "60d", "90d"
};

type BusinessPlanJson = {
  business_profile?: AnyRecord;
  persona?: AnyRecord;
  offer_pyramids?: AnyRecord[];
  selected_offer_pyramid?: AnyRecord;
  selected_offer_pyramid_index?: number;
  action_plan_30_90?: AnyRecord;
  tasks?: Task[];
};

function splitTasksByTimeframe(tasks: Task[] | undefined) {
  const base = { d30: [] as Task[], d60: [] as Task[], d90: [] as Task[] };
  if (!tasks) return base;
  for (const t of tasks) {
    const tf = (t.timeframe || "").toLowerCase();
    if (tf.includes("30")) base.d30.push(t);
    else if (tf.includes("60")) base.d60.push(t);
    else if (tf.includes("90")) base.d90.push(t);
  }
  return base;
}

function formatDate(value?: string): string | null {
  const raw = value || "";
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function computeProgress(tasks: Task[] | undefined): number {
  if (!tasks || tasks.length === 0) return 0;
  const done = tasks.filter((t) => {
    if (!t.status) return false;
    const s = t.status.toLowerCase();
    return (
      s.includes("done") ||
      s.includes("termin") ||
      s.includes("finished") ||
      s.includes("complete")
    );
  }).length;
  return Math.round((done / tasks.length) * 100);
}

type GoalsSectionProps = {
  title: string;
  tasks: Task[];
};

function GoalsSection({ title, tasks }: GoalsSectionProps) {
  const progress = computeProgress(tasks);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="text-xs text-slate-500">{progress}% complété</div>
      </div>

      <div className="mb-3 h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-[#a855f7]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-slate-500">
          Aucun objectif n&apos;est encore défini pour cette période.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task, idx) => (
            <li
              key={`${title}-${idx}-${task.title ?? "t"}`}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-slate-900">
                  {task.title || "Tâche sans titre"}
                </p>
                {task.due_date || task.dueDate ? (
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    Échéance{" "}
                    {formatDate(task.due_date || task.dueDate || undefined)}
                  </span>
                ) : null}
              </div>
              {task.description ? (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {task.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PhaseCardProps = {
  label: string;
  weeksKey: string;
  data: AnyRecord | undefined;
};

function PhaseCard({ label, weeksKey, data }: PhaseCardProps) {
  if (!data) return null;
  const focus = (data.focus as string) || (data["objectif"] as string);
  const actions = (data.actions as string[]) || [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} · {weeksKey.replace("_", " ")}
      </p>
      {focus && (
        <p className="mt-2 text-sm font-medium text-slate-900">{focus}</p>
      )}
      {actions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {actions.map((a, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs text-slate-700"
            >
              <span className="mt-[3px] inline-block h-1.5 w-1.5 rounded-full bg-[#a855f7]" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white">
      {children}
    </span>
  );
}

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/");
  }

  const userEmail = session.user.email ?? "Utilisateur";

  // Récupérer le plan stratégique stocké en JSON
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (planError) {
    console.error("[StrategyPage] Supabase business_plan select error", planError);
  }

  if (!planRow || !planRow.plan_json) {
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as BusinessPlanJson;

  const businessProfile = (planJson.business_profile ?? {}) as AnyRecord;
  const persona = (planJson.persona ?? {}) as AnyRecord;
  const offerPyramids = (planJson.offer_pyramids ?? []) as AnyRecord[];
  const selectedIndex =
    typeof planJson.selected_offer_pyramid_index === "number"
      ? planJson.selected_offer_pyramid_index
      : 0;

  let selectedPyramid = (planJson.selected_offer_pyramid ??
    offerPyramids[selectedIndex] ??
    offerPyramids[0]) as AnyRecord | undefined;

  const actionPlan = (planJson.action_plan_30_90 ?? {}) as AnyRecord;
  const tasks = (planJson.tasks ?? []) as Task[];
  const tasksByTimeframe = splitTasksByTimeframe(tasks);
  const globalProgress = computeProgress(tasks);

  const mainGoal =
    (actionPlan.main_goal as string | undefined) ||
    (actionPlan["objectif_principal"] as string | undefined) ||
    null;

  const revenueGoal =
    (businessProfile.revenue_goal as string | undefined) ||
    (businessProfile.revenue_target as string | undefined) ||
    null;

  const horizonLabel =
    (actionPlan.horizon as string | undefined) ||
    (actionPlan["horizon_principal"] as string | undefined) ||
    "90 jours";

  const weeks_1_4 = actionPlan.weeks_1_4 as AnyRecord | undefined;
  const weeks_5_8 = actionPlan.weeks_5_8 as AnyRecord | undefined;
  const weeks_9_12 = actionPlan.weeks_9_12 as AnyRecord | undefined;

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* HERO VISION STRATÉGIQUE */}
        <section className="mb-8 rounded-2xl bg-gradient-to-r from-[#a855f7] via-[#b042b4] to-[#ec4899] p-6 text-white shadow-lg">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                Plan stratégique
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Votre Vision Stratégique
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/80">
                Plan personnalisé généré par l&apos;IA pour atteindre vos objectifs
                business dans les prochains mois.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs md:text-sm">
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/70">
                  Objectif revenu
                </p>
                <p className="mt-1 font-semibold">
                  {revenueGoal || "Non défini"}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/70">
                  Horizon
                </p>
                <p className="mt-1 font-semibold">{horizonLabel}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/70">
                  Progression
                  <Pill>{globalProgress}%</Pill>
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-white/20">
                  <div
                    className="h-2 rounded-full bg-white"
                    style={{ width: `${globalProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          {mainGoal && (
            <p className="mt-4 text-sm">
              Objectif principal :{" "}
              <span className="font-semibold">{mainGoal}</span>
            </p>
          )}
        </section>

        <main className="space-y-6">
          {/* Pyramide + Persona */}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
            <StrategyClient
              offerPyramids={offerPyramids}
              initialSelectedIndex={selectedIndex}
              initialSelectedPyramid={selectedPyramid}
            />

            {/* Persona cible */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Persona cible
                </h2>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Résumé du client idéal tel qu’il a été compris pendant
                l&apos;onboarding. Tu peux t&apos;y référer pour vérifier que ta
                pyramide d&apos;offres reste alignée.
              </p>
              <div className="space-y-3 text-sm">
                {persona.name && (
                  <p>
                    <span className="font-medium text-slate-900">Profil : </span>
                    {persona.name}
                  </p>
                )}
                {persona.profile && (
                  <p>
                    <span className="font-medium text-slate-900">
                      Situation :{" "}
                    </span>
                    {persona.profile}
                  </p>
                )}
                {persona.pains && (
                  <p>
                    <span className="font-medium text-slate-900">
                      Principales douleurs :
                    </span>
                    <br />
                    <span className="text-slate-700">
                      {Array.isArray(persona.pains)
                        ? persona.pains.join(" · ")
                        : String(persona.pains)}
                    </span>
                  </p>
                )}
                {persona.desires && (
                  <p>
                    <span className="font-medium text-slate-900">
                      Objectifs :
                    </span>
                    <br />
                    <span className="text-slate-700">
                      {Array.isArray(persona.desires)
                        ? persona.desires.join(" · ")
                        : String(persona.desires)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Plan d'action 30/90 jours */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Plan d&apos;Action 30/90 Jours
                </h2>
                <p className="text-xs text-slate-500">
                  Trois phases pour avancer étape par étape. Coche les tâches au
                  fur et à mesure depuis l&apos;onglet Suivi Projet.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <PhaseCard
                label="Phase 1 · Fondations"
                weeksKey="weeks_1_4"
                data={weeks_1_4}
              />
              <PhaseCard
                label="Phase 2 · Croissance"
                weeksKey="weeks_5_8"
                data={weeks_5_8}
              />
              <PhaseCard
                label="Phase 3 · Scale"
                weeksKey="weeks_9_12"
                data={weeks_9_12}
              />
            </div>

            {/* Progressions par phase si on a des tasks */}
            {tasks.length > 0 && (
              <div className="grid gap-4 md:grid-cols-3">
                <GoalsSection
                  title="Jours 1–30"
                  tasks={
                    tasksByTimeframe.d30.length
                      ? tasksByTimeframe.d30
                      : tasks
                  }
                />
                <GoalsSection
                  title="Jours 31–60"
                  tasks={tasksByTimeframe.d60}
                />
                <GoalsSection
                  title="Jours 61–90"
                  tasks={tasksByTimeframe.d90}
                />
              </div>
            )}
          </section>
        </main>
      </div>
    </AppShell>
  );
}
