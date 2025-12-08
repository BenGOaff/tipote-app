// app/strategy/page.tsx
// Page "Plan stratégique" : lit le plan généré après l'onboarding
// depuis la table `business_plan.plan_json` et l'affiche
// dans une mise en page claire (persona, offres, plan 30/90 jours).

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { ReactNode } from "react";

type AnyRecord = Record<string, any>;

type Task = {
  title?: string;
  description?: string;
  status?: string;
  importance?: "low" | "medium" | "high" | string;
  due_date?: string;
  dueDate?: string;
  timeframe?: string; // ex: "30d", "90d", "12m"
};

type BusinessPlanJson = {
  business_profile?: AnyRecord;
  persona?: AnyRecord;
  offer_pyramids?: AnyRecord[];
  action_plan_30_90?: {
    main_goal?: string;
    weeks?: AnyRecord[];
  } & AnyRecord;
  tasks?: Task[];
  modules_recommendations?: AnyRecord;
};

// Helpers simples et robustes : on ne suppose pas une structure rigide de l'IA.
function getString(obj: AnyRecord | undefined, key: string): string | null {
  if (!obj) return null;
  const value = obj[key];
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function splitTasksByTimeframe(tasks: Task[] | undefined) {
  const base = { d30: [] as Task[], d90: [] as Task[], later: [] as Task[] };
  if (!tasks) return base;
  for (const t of tasks) {
    const tf = (t.timeframe || "").toLowerCase();
    if (tf.includes("30")) base.d30.push(t);
    else if (tf.includes("90")) base.d90.push(t);
    else base.later.push(t);
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
          className="h-2 rounded-full bg-[#3b82f6]"
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

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
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

  // 1) Récupérer le plan stratégique stocké en JSON
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (planError) {
    console.error("[StrategyPage] Supabase business_plan select error", planError);
  }

  if (!planRow || !planRow.plan_json) {
    // Si pas de plan → on repart sur l'onboarding
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as BusinessPlanJson;

  const businessProfile = (planJson.business_profile ?? {}) as AnyRecord;
  const persona = (planJson.persona ?? {}) as AnyRecord;
  const offerPyramids = (planJson.offer_pyramids ?? []) as AnyRecord[];
  const actionPlan = (planJson.action_plan_30_90 ?? {}) as AnyRecord;
  const tasks = (planJson.tasks ?? []) as Task[];

  const tasksByTimeframe = splitTasksByTimeframe(tasks);

  const mainGoal =
    (actionPlan.main_goal as string | undefined) ||
    (actionPlan["objectif_principal"] as string | undefined) ||
    null;

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#b042b4]">
              Plan stratégique
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Cap sur les {mainGoal ? "90 prochains jours" : "prochaines étapes"}
            </h1>
            {mainGoal ? (
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Objectif principal :{" "}
                <span className="font-medium text-slate-900">{mainGoal}</span>
              </p>
            ) : (
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Ce plan a été généré automatiquement à partir de ton onboarding.
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-slate-500 md:items-end">
            <p>Basé sur ton profil business et tes réponses d&apos;onboarding.</p>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          {/* Colonne gauche : persona + offres + plan 30/90 */}
          <div className="space-y-6">
            {/* Persona */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Persona cible
                </h2>
                {persona["segment"] ? (
                  <Pill>{String(persona["segment"])}</Pill>
                ) : null}
              </div>

              <p className="mb-3 text-xs text-slate-500">
                Résumé du client idéal tel qu’il a été compris pendant l’onboarding.
              </p>

              <div className="space-y-3 text-sm">
                {getString(persona, "name") && (
                  <p>
                    <span className="font-medium text-slate-900">Nom : </span>
                    {getString(persona, "name")}
                  </p>
                )}
                {getString(persona, "profile") && (
                  <p>
                    <span className="font-medium text-slate-900">Profil : </span>
                    {getString(persona, "profile")}
                  </p>
                )}
                {getString(persona, "pains") && (
                  <p>
                    <span className="font-medium text-slate-900">Douleurs : </span>
                    {getString(persona, "pains")}
                  </p>
                )}
                {getString(persona, "desires") && (
                  <p>
                    <span className="font-medium text-slate-900">Désirs : </span>
                    {getString(persona, "desires")}
                  </p>
                )}
                {getString(persona, "objections") && (
                  <p>
                    <span className="font-medium text-slate-900">
                      Objections clés :{" "}
                    </span>
                    {getString(persona, "objections")}
                  </p>
                )}
              </div>
            </section>

            {/* Pyramide d'offres */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Pyramide d&apos;offres recommandée
                </h2>
                {offerPyramids.length > 1 ? (
                  <span className="text-[11px] text-slate-500">
                    {offerPyramids.length} scénarios proposés
                  </span>
                ) : null}
              </div>

              {offerPyramids.length === 0 ? (
                <p className="text-xs text-slate-500">
                  La pyramide d&apos;offres n&apos;a pas encore été générée ou n&apos;a
                  pas été incluse dans le plan.
                </p>
              ) : (
                <div className="space-y-4">
                  {offerPyramids.map((scenario, idx) => {
                    const label =
                      (scenario.name as string) ||
                      (scenario.label as string) ||
                      `Scénario ${idx + 1}`;
                    const levels =
                      (scenario.levels as AnyRecord[] | undefined) ||
                      (scenario.offers as AnyRecord[] | undefined) ||
                      [];
                    return (
                      <div
                        key={`scenario-${idx}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                      >
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {label}
                        </p>
                        {levels.length === 0 ? (
                          <pre className="whitespace-pre-wrap break-words rounded-md bg-white/80 p-2 text-[11px] text-slate-700">
                            {JSON.stringify(scenario, null, 2)}
                          </pre>
                        ) : (
                          <ul className="space-y-2">
                            {levels.map((offer, levelIdx) => (
                              <li
                                key={`offer-${idx}-${levelIdx}`}
                                className="flex items-start gap-2 rounded-md bg-white px-3 py-2"
                              >
                                <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-[#b042b4]/10 text-[11px] font-semibold text-[#b042b4] flex items-center justify-center">
                                  {levelIdx + 1}
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-slate-900">
                                    {(offer.name as string) ||
                                      (offer.title as string) ||
                                      "Offre"}
                                  </p>
                                  {offer.description && (
                                    <p className="text-[11px] text-slate-600">
                                      {String(offer.description)}
                                    </p>
                                  )}
                                  {(offer.price || offer.price_range) && (
                                    <p className="text-[11px] text-slate-500">
                                      Prix cible :{" "}
                                      <span className="font-medium text-slate-800">
                                        {String(offer.price || offer.price_range)}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Plan d'action synthétique */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Résumé du plan 30/90 jours
              </h2>
              {actionPlan && Object.keys(actionPlan).length > 0 ? (
                <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-[11px] text-slate-700">
                  {JSON.stringify(actionPlan, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">
                  Le plan d&apos;action détaillé n&apos;a pas encore été généré.
                </p>
              )}
            </section>
          </div>

          {/* Colonne droite : tâches et progression */}
          <div className="space-y-4">
            <GoalsSection
              title="Phase 1 · 30 jours"
              tasks={tasksByTimeframe.d30.length ? tasksByTimeframe.d30 : tasks}
            />
            <GoalsSection
              title="Phase 2 · 90 jours"
              tasks={tasksByTimeframe.d90}
            />
            {tasksByTimeframe.later.length > 0 && (
              <GoalsSection
                title="Plus tard / long terme"
                tasks={tasksByTimeframe.later}
              />
            )}

            {/* Bloc résumé business */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">
                Profil business (résumé)
              </h2>
              <p className="mb-2 text-xs text-slate-500">
                Ces informations viennent directement de l&apos;onboarding et
                servent de base à toutes les recommandations de Tipote.
              </p>
              {Object.keys(businessProfile).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Le profil business détaillé n&apos;a pas encore été stocké.
                </p>
              ) : (
                <dl className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                  {Object.entries(businessProfile)
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <div key={key} className="space-y-0.5">
                        <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                          {key.replace(/_/g, " ")}
                        </dt>
                        <dd className="text-xs font-medium text-slate-900">
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
            </section>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
