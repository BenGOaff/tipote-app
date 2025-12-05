// app/app/page.tsx
// Rôle : vue d’ensemble (dashboard) protégée, utilise AppShell.
// - Si aucun plan stratégique n'existe encore pour l'utilisateur,
//   on le redirige vers la page d'onboarding (/onboarding).
// - Sinon, on affiche un résumé du plan stocké dans business_plan.plan_json.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';

type AnyRecord = Record<string, any>;

type BusinessPlanJson = {
  business_profile?: AnyRecord;
  persona?: AnyRecord;
  offer_pyramids?: AnyRecord[];
  action_plan_30_90?: AnyRecord;
  tasks?: AnyRecord[];
  modules_recommendations?: AnyRecord;
};

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
  const persona = (planJson.persona ?? {}) as AnyRecord;
  const actionPlan = (planJson.action_plan_30_90 ??
    {}) as AnyRecord;

  const tasks = Array.isArray(planJson.tasks)
    ? (planJson.tasks as AnyRecord[])
    : [];

  const nextTasks = tasks.slice(0, 4);

  const goal90 =
    businessProfile.goal_90_days ??
    businessProfile.main_goal ??
    actionPlan.main_goal ??
    '';

  const mission =
    businessProfile.mission ??
    businessProfile.mission_statement ??
    '';

  const niche =
    businessProfile.niche ??
    businessProfile.market ??
    '';

  const maturity =
    businessProfile.business_maturity ??
    businessProfile.maturity ??
    '';

  const personaName =
    persona.name ??
    persona.label ??
    'Client idéal';

  const personaSummary =
    persona.summary ??
    persona.description ??
    '';

  const personaPains: string[] = Array.isArray(persona.pains)
    ? persona.pains
    : [];
  const personaDesires: string[] = Array.isArray(persona.desires)
    ? persona.desires
    : [];

  const weeks: AnyRecord[] = Array.isArray(actionPlan.weeks)
    ? (actionPlan.weeks as AnyRecord[])
    : [];

  return (
    <AppShell userEmail={userEmail}>
      {/* En-tête */}
      <section className="space-y-2 mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Vue d&apos;ensemble
        </h1>
        <p className="text-sm text-slate-500">
          Ton plan stratégique personnalisé, basé sur tes réponses
          d&apos;onboarding. À partir d&apos;ici, Tipote va t&apos;aider à
          exécuter bloc par bloc.
        </p>
      </section>

      {/* Grille principale : 3 blocs principaux */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Colonne 1 : Profil business */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Profil business
          </h2>
          <p className="text-xs text-slate-500">
            Synthèse de ta situation actuelle : niche, mission, maturité et
            objectif prioritaire.
          </p>

          <div className="space-y-2 text-xs">
            {niche && (
              <div>
                <p className="font-medium text-slate-700">Niche</p>
                <p className="text-slate-600">{niche}</p>
              </div>
            )}

            {mission && (
              <div>
                <p className="font-medium text-slate-700">Mission</p>
                <p className="text-slate-600 whitespace-pre-line">
                  {mission}
                </p>
              </div>
            )}

            {maturity && (
              <div>
                <p className="font-medium text-slate-700">
                  Maturité business
                </p>
                <p className="text-slate-600">{maturity}</p>
              </div>
            )}

            {goal90 && (
              <div>
                <p className="font-medium text-slate-700">
                  Objectif prioritaire (90 jours)
                </p>
                <p className="text-slate-600 whitespace-pre-line">
                  {goal90}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Colonne 2 : Persona */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Persona client idéal
          </h2>
          <p className="text-xs text-slate-500">
            Résumé de la personne à qui tu t&apos;adresses en priorité,
            d&apos;après ton onboarding.
          </p>

          <div className="space-y-2 text-xs">
            <div>
              <p className="font-medium text-slate-700">Nom / label</p>
              <p className="text-slate-600">{personaName}</p>
            </div>

            {personaSummary && (
              <div>
                <p className="font-medium text-slate-700">Résumé</p>
                <p className="text-slate-600 whitespace-pre-line">
                  {personaSummary}
                </p>
              </div>
            )}

            {personaPains.length > 0 && (
              <div>
                <p className="font-medium text-slate-700">
                  Douleurs principales
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                  {personaPains.slice(0, 4).map((pain, index) => (
                    <li key={index}>{pain}</li>
                  ))}
                </ul>
              </div>
            )}

            {personaDesires.length > 0 && (
              <div>
                <p className="font-medium text-slate-700">
                  Désirs principaux
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                  {personaDesires.slice(0, 4).map((desire, index) => (
                    <li key={index}>{desire}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Colonne 3 : Prochaines actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Prochaines actions
          </h2>
          <p className="text-xs text-slate-500">
            Focus sur les prochains blocs d&apos;action issus de ton plan
            30/90 jours.
          </p>

          {/* Vue par semaines si disponible */}
          {weeks.length > 0 && (
            <div className="space-y-2 text-xs mb-3">
              {weeks.slice(0, 3).map((week, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-slate-50 px-3 py-2"
                >
                  <p className="font-medium text-slate-700">
                    {week.label ?? `Semaine ${index + 1}`}
                  </p>
                  {week.focus && (
                    <p className="mt-0.5 text-slate-600">
                      Focus : {week.focus}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Liste des tâches prioritaires */}
          <div className="space-y-2 text-xs">
            {nextTasks.length === 0 ? (
              <p className="text-slate-500">
                Les tâches détaillées de ton plan seront bientôt visibles
                ici sous forme de blocks. Pour l&apos;instant, tu peux
                utiliser l&apos;onglet &quot;Blocks business&quot; pour
                créer tes propres blocs.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {nextTasks.map((task, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="font-medium text-slate-800">
                      {task.title ?? `Tâche ${index + 1}`}
                    </p>
                    {task.description && (
                      <p className="mt-0.5 text-slate-600 text-[11px] whitespace-pre-line">
                        {task.description}
                      </p>
                    )}
                    {task.status && (
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                        Statut : {task.status}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
