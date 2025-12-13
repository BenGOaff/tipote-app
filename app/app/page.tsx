// app/app/page.tsx
// Dashboard "Aujourd’hui" (v2)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI alignée cahier des charges : banner prochaine action + 4 stats + progression + actions rapides + à venir

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type AnyRecord = Record<string, any>;

type Task = {
  title?: string;
  description?: string;
  status?: string;
  importance?: "low" | "medium" | "high" | string;
  due_date?: string;
  dueDate?: string;
  channel?: string;
  type?: string;
};

type BusinessPlanJson = {
  business_profile?: AnyRecord;
  persona?: AnyRecord;
  tasks?: Task[];
  action_plan_30_90?: {
    main_goal?: string;
    phase?: string;
    current_week?: number;
  };
};

function isDoneStatus(status: string | undefined | null): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "terminé", "termine", "finished"].some((k) =>
    s.includes(k),
  );
}

function parseDueDate(task: Task): Date | null {
  const value = task.due_date ?? task.dueDate;
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatRelativeDay(d: Date, now: Date): string {
  const a = startOfDay(now).getTime();
  const b = startOfDay(d).getTime();
  const diffDays = Math.round((b - a) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd’hui";
  if (diffDays === 1) return "Demain";
  if (diffDays === -1) return "Hier";
  // fallback simple
  return d.toLocaleDateString("fr-FR", { weekday: "long" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function progressBarWidth(percent: number) {
  const p = clamp(percent, 0, 100);
  return `${p}%`;
}

export default async function AppPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "Utilisateur";

  // 1) Charger le plan stratégique
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (planError) {
    console.error("[AppPage] Supabase business_plan select error", planError);
  }

  // 2) Si pas de plan => onboarding
  if (!planRow || !planRow.plan_json) {
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as BusinessPlanJson;

  const businessProfile = (planJson.business_profile ?? {}) as AnyRecord;
  const actionPlan = (planJson.action_plan_30_90 ?? {}) as BusinessPlanJson["action_plan_30_90"];

  const rawTasks = Array.isArray(planJson.tasks) ? (planJson.tasks as Task[]) : [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);

  const tasks = rawTasks
    .map((t) => {
      const due = parseDueDate(t);
      return {
        ...t,
        _dueDate: due as Date | null,
        _isDone: isDoneStatus(t.status),
        _isImportant: String(t.importance ?? "").toLowerCase() === "high",
      };
    })
    // tri stable : d'abord échéance, puis important
    .sort((a: any, b: any) => {
      const da = a._dueDate ? a._dueDate.getTime() : Number.POSITIVE_INFINITY;
      const db = b._dueDate ? b._dueDate.getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a._isImportant !== b._isImportant) return a._isImportant ? -1 : 1;
      return 0;
    });

  const overdueTasks = tasks.filter((t: any) => t._dueDate && t._dueDate < todayStart && !t._isDone);
  const tasksToday = tasks.filter((t: any) => t._dueDate && t._dueDate >= todayStart && t._dueDate < tomorrowStart && !t._isDone);
  const upcomingWeek = tasks.filter((t: any) => t._dueDate && t._dueDate >= tomorrowStart && t._dueDate < weekEnd && !t._isDone);

  const totalTasks = tasks.length;
  const doneTasksCount = tasks.filter((t: any) => t._isDone).length;
  const progressPercent = totalTasks === 0 ? 0 : Math.round((doneTasksCount / totalTasks) * 100);

  // Objectif 90 jours (plusieurs variantes possibles dans le JSON)
  const goal90 =
    actionPlan?.main_goal ??
    businessProfile.main_goal ??
    businessProfile.goal_90_days ??
    "";

  // Prochaine action = priorité aux retards, sinon aujourd'hui, sinon placeholder
  const nextTask: any =
    overdueTasks[0] ??
    tasksToday[0] ??
    null;

  const nextTitle =
    nextTask?.title?.trim?.() ||
    (overdueTasks.length > 0
      ? "Rattraper une tâche en retard"
      : tasksToday.length > 0
        ? "Exécuter une tâche du jour"
        : "Commencer ton plan d’action");

  const nextTime =
    nextTask?._dueDate ? formatTime(nextTask._dueDate) : "—";

  const nextChannel =
    String(nextTask?.channel ?? "LinkedIn");

  const nextType =
    String(nextTask?.type ?? "Tâche");

  // 4 stats cards (certaines sont placeholders tant qu’on ne track pas tout)
  const contentsPublished = Number(businessProfile.contents_published ?? 0);
  const plannedContents = Number(businessProfile.contents_planned ?? 0);
  const engagement = Number(businessProfile.engagement ?? 0);

  const tasksRatio = totalTasks > 0 ? `${doneTasksCount}/${totalTasks}` : "0/0";

  const nextDeadlineDays =
    nextTask?._dueDate
      ? Math.max(0, Math.ceil((startOfDay(nextTask._dueDate).getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

  const nextDeadlineLabel =
    nextDeadlineDays === null
      ? "—"
      : nextDeadlineDays === 0
        ? "0j"
        : `${nextDeadlineDays}j`;

  // Progression semaine (placeholders cohérents)
  const weekNumber = typeof actionPlan?.current_week === "number" ? actionPlan.current_week : 2;
  const planStrategicProgress = clamp(progressPercent, 0, 100);
  const plannedProgress = plannedContents > 0 ? clamp(Math.round((contentsPublished / plannedContents) * 100), 0, 100) : 0;
  const engagementTarget = Number(businessProfile.engagement_target ?? 5000);
  const engagementProgress = engagementTarget > 0 ? clamp(Math.round((engagement / engagementTarget) * 100), 0, 100) : 0;

  // List "À venir cette semaine" : on affiche soit des tâches à venir, soit fallback
  const upcomingList = upcomingWeek.slice(0, 6).map((t: any) => {
    const d = t._dueDate as Date | null;
    return {
      time: d ? formatTime(d) : "—",
      title: (t.title as string) || "Contenu planifié",
      day: d ? formatRelativeDay(d, now) : "Cette semaine",
      type: String(t.type ?? "Tâche"),
    };
  });

  const showFallbackUpcoming = upcomingList.length === 0;

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        {/* Banner prochaine action */}
        <section className="rounded-2xl bg-[#b042b4] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/90">
                Ta prochaine action
              </p>

              <h1 className="text-lg md:text-xl font-semibold">Aujourd’hui</h1>

              <p className="text-sm text-white/95 max-w-2xl">
                {nextTitle}
                {typeof goal90 === "string" && goal90.trim().length > 0 ? (
                  <span className="text-white/90"> — Objectif : “{goal90}”</span>
                ) : null}
              </p>

              <div className="pt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  {nextType}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  {nextChannel}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                  {nextTime}
                </span>
                {overdueTasks.length > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                    {overdueTasks.length} en retard
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              >
                Créer en 1 clic
              </Link>
              <Link
                href="/strategy"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Voir la stratégie
              </Link>
            </div>
          </div>
        </section>

        {/* 4 stats cards */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Contenus publiés" value={String(contentsPublished)} sub="(placeholder si non tracké)" />
          <StatCard title="Tâches complétées" value={tasksRatio} sub="sur ton plan actuel" />
          <StatCard title="Engagement" value={engagement ? engagement.toLocaleString("fr-FR") : "—"} sub="(placeholder)" />
          <StatCard title="Prochaine échéance" value={nextDeadlineLabel} sub={nextTask?.title ? String(nextTask.title) : "—"} />
        </section>

        {/* Progression + Actions rapides */}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Progression de la semaine</h2>
                <p className="text-sm text-slate-600">Semaine {weekNumber} sur 12</p>
              </div>
              <Link
                href="/strategy"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
              >
                Voir ma stratégie complète
              </Link>
            </div>

            <div className="mt-6 space-y-6">
              <ProgressRow label="Plan stratégique" right={`${planStrategicProgress}%`} percent={planStrategicProgress} />
              <ProgressRow label="Contenus planifiés" right={plannedContents ? `${contentsPublished}/${plannedContents}` : "—"} percent={plannedProgress} />
              <ProgressRow
                label="Objectif engagement"
                right={engagementTarget ? `${engagement.toLocaleString("fr-FR")}/${engagementTarget.toLocaleString("fr-FR")}` : "—"}
                percent={engagementProgress}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Actions rapides</h2>
            <div className="mt-4 space-y-2">
              <QuickLink href="/create" label="Créer du contenu" />
              <QuickLink href="/contents" label="Voir mes contenus" />
              <QuickLink href="/strategy" label="Ma stratégie" />
            </div>
          </div>
        </section>

        {/* À venir cette semaine */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900">À venir cette semaine</h2>
            <Link
              href="/contents"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              Tout voir
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {showFallbackUpcoming ? (
              <>
                <UpcomingRow time="09:00" title="Post LinkedIn - Conseil expert" day="Aujourd’hui" type="Post" />
                <UpcomingRow time="14:00" title="Email newsletter - Storytelling" day="Demain" type="Email" />
                <UpcomingRow time="10:00" title="Script Reel - Hook + CTA" day="Mercredi" type="Vidéo" />
                <UpcomingRow time="16:00" title="Article blog - Guide complet" day="Jeudi" type="Article" />
              </>
            ) : (
              upcomingList.map((u, idx) => (
                <UpcomingRow
                  key={`${u.time}-${u.title}-${idx}`}
                  time={u.time}
                  title={u.title}
                  day={u.day}
                  type={u.type}
                />
              ))
            )}
          </div>

          {/* mini rappel “tâches du jour” (optionnel mais utile) */}
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Tâches du jour</p>
              <span className="text-xs text-slate-600">{tasksToday.length} à faire</span>
            </div>

            {tasksToday.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Rien de planifié aujourd’hui. Tu peux avancer sur la stratégie ou créer un contenu.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tasksToday.slice(0, 4).map((t: any, i: number) => (
                  <li key={`${t.title ?? "task"}-${i}`} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.title ?? "Tâche"}</p>
                      <p className="text-xs text-slate-600">
                        {t._dueDate ? `${formatRelativeDay(t._dueDate, now)} • ${formatTime(t._dueDate)}` : "Aujourd’hui"}
                        {t._isImportant ? " • Prioritaire" : ""}
                      </p>
                    </div>
                    <span className="mt-0.5 inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {t._isImportant ? "Prioritaire" : "À faire"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Lien “Analytics détaillés” (cahier des charges) */}
        <div className="flex justify-end">
          <Link
            href="/analytics"
            className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4"
          >
            Analytics détaillés
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function ProgressRow({ label, right, percent }: { label: string; right: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-sm text-slate-600">{right}</p>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-[#b042b4]"
          style={{ width: progressBarWidth(percent) }}
        />
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
    >
      <span>{label}</span>
      <span className="text-slate-400">→</span>
    </Link>
  );
}

function UpcomingRow({ time, title, day, type }: { time: string; title: string; day: string; type: string }) {
  return (
    <div className="py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-14 text-sm font-semibold text-slate-900">{time}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{day}</p>
        </div>
      </div>
      <span className="shrink-0 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
        {type}
      </span>
    </div>
  );
}
