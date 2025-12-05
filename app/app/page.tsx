// app/app/page.tsx
// Rôle : Dashboard principal Tipote.
// - Protégé par l'auth Supabase.
// - Si aucun plan stratégique n'existe encore pour l'utilisateur, redirige vers /onboarding.
// - Sinon, affiche une vue d'ensemble avec :
//   A. Message du "Coach IA" (généré localement pour l'instant, sans appel OpenAI).
//   B. Tâches du jour (à partir des tasks du plan si présentes, sinon placeholder).
//   C. Contenus à publier (placeholder en attendant le module Contenus).
//   D. Progression objectif 90 jours (calculée à partir des tasks si présentes).
//   E. Modules actifs (raccourcis vers les modules de l'app).
//   F. Stats rapides (placeholder en attendant le tracking réel).

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';

type AnyRecord = Record<string, any>;

type Task = {
  title?: string;
  description?: string;
  status?: string;
  importance?: 'low' | 'medium' | 'high' | string;
  due_date?: string;
  dueDate?: string;
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

function isDoneStatus(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return ['done', 'completed', 'terminé', 'termine', 'finished'].some((k) =>
    s.includes(k),
  );
}

function parseDueDate(task: Task): Date | null {
  const value = task.due_date ?? task.dueDate;
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AppPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  const userEmail = session.user.email ?? 'Utilisateur';

  // 1) Récupérer le plan stratégique de l'utilisateur
  const { data: planRow, error: planError } = await supabase
    .from('business_plan')
    .select('id, plan_json')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (planError) {
    console.error('[AppPage] Supabase business_plan select error', planError);
  }

  // 2) Si aucun plan trouvé, on redirige vers l'onboarding
  if (!planRow || !planRow.plan_json) {
    redirect('/onboarding');
  }

  const planJson = (planRow.plan_json ?? {}) as BusinessPlanJson;

  const businessProfile = (planJson.business_profile ??
    {}) as AnyRecord;
  const actionPlan = (planJson.action_plan_30_90 ??
    {}) as BusinessPlanJson['action_plan_30_90'];

  const rawTasks = Array.isArray(planJson.tasks)
    ? (planJson.tasks as Task[])
    : [];

  // Objectif 90 jours (variante selon la façon dont l'IA l'a nommé)
  const goal90 =
    actionPlan?.main_goal ??
    businessProfile.main_goal ??
    businessProfile.goal_90_days ??
    '';

  // 3) Préparation des tâches (du jour / en retard / à venir)
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );

  const enrichedTasks = rawTasks.map((task) => {
    const due = parseDueDate(task);
    const status = task.status ?? '';
    return {
      ...task,
      _dueDate: due,
      _isDone: isDoneStatus(status),
      _isImportant:
        (task.importance ?? '').toLowerCase() === 'high' ? true : false,
    };
  });

  const tasksToday = enrichedTasks.filter(
    (t) =>
      t._dueDate &&
      t._dueDate >= startOfToday &&
      t._dueDate < endOfToday &&
      !t._isDone,
  );

  const overdueTasks = enrichedTasks.filter(
    (t) => t._dueDate && t._dueDate < startOfToday && !t._isDone,
  );

  const upcomingTasks = enrichedTasks
    .filter((t) => t._dueDate && t._dueDate >= endOfToday && !t._isDone)
    .sort((a, b) => {
      if (!a._dueDate || !b._dueDate) return 0;
      return a._dueDate.getTime() - b._dueDate.getTime();
    });

  const totalTasks = enrichedTasks.length;
  const doneTasksCount = enrichedTasks.filter((t) => t._isDone).length;
  const progressPercent =
    totalTasks === 0 ? 0 : Math.round((doneTasksCount / totalTasks) * 100);

  // 4) Message du "Coach IA" (sans appel OpenAI pour l'instant)
  let coachMessage = `Bienvenue dans Tipote. On va avancer ensemble sur ton objectif des 90 prochains jours.`;
  const firstGoalSentence =
    typeof goal90 === 'string' && goal90.trim().length > 0
      ? ` Ton objectif prioritaire est : "${goal90}".`
      : '';

  if (overdueTasks.length > 0) {
    const example = overdueTasks[0];
    const title = example.title || 'une tâche importante';
    coachMessage = `Tu as ${overdueTasks.length} tâche(s) en retard. Par exemple : "${title}". On commence par ça aujourd'hui ?${firstGoalSentence}`;
  } else if (tasksToday.length > 0) {
    const example = tasksToday[0];
    const title = example.title || 'une action clé';
    coachMessage = `Aujourd'hui, tu as ${tasksToday.length} tâche(s) prévue(s). Par exemple : "${title}". Si tu les termines, tu avances concrètement vers ton objectif.${firstGoalSentence}`;
  } else if (upcomingTasks.length > 0) {
    const next = upcomingTasks[0];
    const title = next.title || 'une étape importante';
    const daysDiff =
      next._dueDate
        ? Math.max(
            1,
            Math.round(
              (next._dueDate.getTime() - startOfToday.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 1;
    coachMessage = `Prochaine grosse étape dans ${daysDiff} jour(s) : "${title}". On peut dès maintenant planifier ou préparer ce bloc.${firstGoalSentence}`;
  } else if (totalTasks > 0 && progressPercent < 100) {
    coachMessage = `Tu as déjà ${
      doneTasksCount
    } tâche(s) complétée(s) sur ${totalTasks}. On continue sur cette lancée pour te rapprocher de ton objectif.${firstGoalSentence}`;
  } else if (progressPercent === 100 && totalTasks > 0) {
    coachMessage = `Bravo, toutes les tâches de ton plan actuel sont complétées 🎉 On pourra bientôt générer un nouveau plan ou renforcer le suivant.${firstGoalSentence}`;
  } else if (firstGoalSentence) {
    coachMessage = `On va construire et exécuter un plan d'action aligné sur toi.${firstGoalSentence}`;
  }

  // 5) Pour l'instant, on ne lit pas encore les contenus / stats depuis la BDD.
  // On prépare juste la structure du dashboard avec placeholders.

  const tasksForWidget = [
    ...tasksToday,
    ...overdueTasks.filter(
      (t) => !tasksToday.includes(t) && tasksToday.length < 5,
    ),
  ].slice(0, 5);

  return (
    <AppShell userEmail={userEmail}>
      {/* A. Message du Coach IA */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Coach IA
            </p>
            <p className="text-sm text-slate-900 whitespace-pre-line">
              {coachMessage}
            </p>
          </div>
          <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-500">
            Dashboard
          </div>
        </div>
      </section>

      {/* Grille principale */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Colonne principale : B. Tâches du jour + C. Contenus à publier */}
        <div className="space-y-4 lg:col-span-2">
          {/* B. Tâches du jour */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Tâches du jour
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Les actions prévues pour aujourd&apos;hui et les éventuels
                  retards.
                </p>
              </div>
              <button
                type="button"
                className="text-[11px] font-medium text-slate-600 hover:underline"
              >
                Voir tout
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {tasksForWidget.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Tu n&apos;as pas encore de tâches planifiées dans ton
                  tableau de suivi. Bientôt, tu pourras générer et suivre
                  tes tâches ici à partir de ton plan stratégique.
                </p>
              ) : (
                tasksForWidget.map((task, index) => {
                  const statusLabel = task.status || 'À faire';
                  const due =
                    task._dueDate instanceof Date
                      ? task._dueDate.toLocaleDateString('fr-FR')
                      : null;
                  const isOverdue =
                    task._dueDate && task._dueDate < startOfToday;

                  return (
                    <div
                      key={index}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex-1 space-y-0.5">
                        <p className="text-xs font-medium text-slate-900">
                          {task.title || `Tâche ${index + 1}`}
                        </p>
                        {task.description && (
                          <p className="text-[11px] text-slate-600 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500">
                          Statut : {statusLabel}
                          {due && (
                            <>
                              {' '}
                              • Échéance :{' '}
                              <span
                                className={
                                  isOverdue
                                    ? 'font-semibold text-red-500'
                                    : ''
                                }
                              >
                                {due}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          className="h-4 w-4 rounded border border-slate-300 bg-white"
                          title="Marquer comme terminée (bientôt)"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* C. Contenus à publier */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Contenus à publier
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Ici apparaîtront les contenus validés avec une date de
                  publication pour aujourd&apos;hui.
                </p>
              </div>
              <button
                type="button"
                className="text-[11px] font-medium text-slate-600 hover:underline"
              >
                Aller au module Contenus
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center">
              <p className="text-xs text-slate-500">
                Bientôt, Tipote te montrera ici les posts, emails et autres
                contenus prêts à publier selon ton calendrier éditorial.
              </p>
            </div>
          </div>
        </div>

        {/* Colonne latérale : D, E, F */}
        <div className="space-y-4">
          {/* D. Progression objectif 90 jours */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Progression objectif 90 jours
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Estimation basée sur les tâches complétées par rapport au
              total de ton plan actuel.
            </p>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{progressPercent}% complété</span>
                <span>
                  {doneTasksCount}/{totalTasks} tâche(s)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {goal90 && (
                <p className="mt-2 text-[11px] text-slate-600">
                  Objectif : <span className="font-medium">{goal90}</span>
                </p>
              )}

              <p className="mt-1 text-[11px] text-slate-500">
                La pondération des tâches (importance) et l&apos;historique
                d&apos;évolution seront ajoutés ensuite.
              </p>
            </div>
          </div>

          {/* E. Modules actifs */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Modules actifs
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Accès rapide aux principaux modules de Tipote.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <a
                href="/app/blocks"
                className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
              >
                <span className="font-medium text-slate-900">
                  Stratégie
                </span>
                <span className="text-[11px] text-slate-600">
                  Plan d&apos;action & tâches
                </span>
                <span className="mt-1 inline-flex w-fit rounded-full bg-emerald-100 px-2 py-[2px] text-[10px] font-medium text-emerald-700">
                  Actif
                </span>
              </a>

              <a
                href="/app/automations"
                className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
              >
                <span className="font-medium text-slate-900">
                  Automatisations
                </span>
                <span className="text-[11px] text-slate-600">
                  n8n & Systeme.io
                </span>
                <span className="mt-1 inline-flex w-fit rounded-full bg-slate-200 px-2 py-[2px] text-[10px] font-medium text-slate-700">
                  Bientôt
                </span>
              </a>

              <a
                href="/app/account"
                className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
              >
                <span className="font-medium text-slate-900">
                  Compte
                </span>
                <span className="text-[11px] text-slate-600">
                  Profil & abonnement
                </span>
              </a>

              <div className="flex flex-col rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-medium text-slate-900">
                  Stats
                </span>
                <span className="text-[11px] text-slate-600">
                  Tracking & KPIs
                </span>
                <span className="mt-1 inline-flex w-fit rounded-full bg-slate-200 px-2 py-[2px] text-[10px] font-medium text-slate-700">
                  À venir
                </span>
              </div>
            </div>
          </div>

          {/* F. Stats rapides */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Stats rapides
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Quand tu auras connecté tes stats, Tipote affichera ici
              quelques KPIs clés.
            </p>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">
                  Abonnés gagnés cette semaine
                </span>
                <span className="font-semibold text-slate-900">–</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">
                  Taux d&apos;ouverture emails
                </span>
                <span className="font-semibold text-slate-900">–</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Ventes du mois</span>
                <span className="font-semibold text-slate-900">–</span>
              </div>

              <p className="mt-2 text-[11px] text-slate-500">
                Bientôt, tu pourras connecter tes stats (emails, ventes,
                audience) pour avoir un suivi centralisé ici.
              </p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
