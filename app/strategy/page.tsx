// app/strategy/page.tsx
// Page "Plan stratégique" connectée à Supabase (lecture de la stratégie générée après l'onboarding)

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type PersonaRow = {
  id: string;
  name: string | null;
  role: string | null;
  description: string | null;
  pains: string | null;
  desires: string | null;
  objections: string | null;
  current_situation: string | null;
  desired_situation: string | null;
};

type OfferRow = {
  id: string;
  level: "lead_magnet" | "entry" | "core" | "premium" | "backend";
  name: string | null;
  description: string | null;
  promise: string | null;
  price_min: number | null;
  price_max: number | null;
};

type GoalRow = {
  id: string;
  horizon: "30d" | "90d" | "12m";
  title: string;
  description: string | null;
  status: "not_started" | "in_progress" | "done" | "blocked";
  deadline: string | null;
};

type StrategyWithRelations = {
  id: string;
  business_name: string | null;
  business_stage: string | null;
  target_market: string | null;
  mission: string | null;
  vision: string | null;
  value_proposition: string | null;
  ai_summary: string | null;
  personas: PersonaRow[];
  offers: OfferRow[];
  goals: GoalRow[];
};

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return (
      new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: 0,
      }).format(value) + "€"
    );
  } catch {
    return `${value}€`;
  }
}

function computeGoalsProgress(goals: GoalRow[]): number {
  if (!goals || goals.length === 0) return 0;
  const done = goals.filter((g) => g.status === "done").length;
  return Math.round((done / goals.length) * 100);
}

function GoalsSection({
  title,
  goals,
}: {
  title: string;
  goals: GoalRow[];
}) {
  const progress = computeGoalsProgress(goals);

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

      {goals.length === 0 ? (
        <p className="text-xs text-slate-500">
          Aucun objectif n&apos;a encore été généré pour cette période.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span
                className={[
                  "mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border text-[10px]",
                  goal.status === "done"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                    : "border-slate-300 bg-white text-slate-400",
                ].join(" ")}
              >
                ✓
              </span>
              <div className="flex-1">
                <p className="font-medium text-slate-900">{goal.title}</p>
                {goal.description && (
                  <p className="text-xs text-slate-600">{goal.description}</p>
                )}
                {goal.deadline && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    🗓️ Deadline : {goal.deadline}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();

  // 1) Vérifier la session utilisateur
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "";

  // 2) Récupérer la dernière stratégie de l'utilisateur
  const { data: strategyRow, error } = await supabase
    .from("strategies")
    .select(
      `
      id,
      business_name,
      business_stage,
      target_market,
      mission,
      vision,
      value_proposition,
      ai_summary,
      personas:personas (*),
      offers:offer_pyramids (*),
      goals:strategy_goals (*)
    `
    )
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[StrategyPage] Error loading strategy", error);
  }

  // Si aucune stratégie n'existe encore, on renvoie vers l'onboarding
  if (!strategyRow) {
    redirect("/onboarding");
  }

  const strategy = strategyRow as unknown as StrategyWithRelations;

  const mainPersona = strategy.personas?.[0] ?? null;

  const offers = strategy.offers ?? [];
  const offerLeadMagnet = offers.find((o) => o.level === "lead_magnet");
  const offerEntry = offers.find((o) => o.level === "entry" || o.level === "core");
  const offerPremium = offers.find((o) => o.level === "premium");

  const goals = strategy.goals ?? [];
  const goals30d = goals.filter((g) => g.horizon === "30d");
  const goals90d = goals.filter((g) => g.horizon === "90d");

  const overallProgress = computeGoalsProgress(goals);
  const main90dGoal = goals90d[0];

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        {/* Titre page */}
        <header>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Plan stratégique
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Plan personnalisé généré par l&apos;IA à partir de ton onboarding.
          </p>
        </header>

        {/* Bloc Vision stratégique */}
        <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-[#0f62fe] via-[#7c3aed] to-[#ec4899] p-[1px] shadow-sm">
          <div className="rounded-[10px] bg-slate-900/90 px-4 py-4 text-slate-50 md:px-6 md:py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-300 tracking-wide">
                  Votre vision stratégique
                </p>
                <h2 className="mt-1 text-lg font-semibold md:text-xl">
                  {strategy.business_name || "Ton plan pour les 90 prochains jours"}
                </h2>
                <p className="mt-1 max-w-xl text-xs md:text-sm text-slate-200">
                  {strategy.ai_summary ||
                    "Plan généré par l’IA pour t’aider à clarifier ton focus et tes priorités business."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs md:text-sm md:grid-cols-3">
                <div className="rounded-lg bg-slate-800/70 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-400">
                    Objectif principal
                  </p>
                  <p className="mt-1 font-semibold text-slate-50">
                    {main90dGoal?.title || "Objectif 90 jours"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-800/70 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-400">
                    Horizon
                  </p>
                  <p className="mt-1 font-semibold text-slate-50">
                    {goals90d.length > 0 ? "90 jours" : "30 jours"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-800/70 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-400">
                    Progression globale
                  </p>
                  <p className="mt-1 font-semibold text-slate-50">
                    {overallProgress}%
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-emerald-400"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ligne Pyramide d'offres + Persona */}
        <section className="grid gap-4 md:grid-cols-2">
          {/* Pyramide d'offres */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Pyramide d&apos;offres
            </h3>
            <p className="mb-3 text-xs text-slate-600">
              Tes offres principales organisées par niveau. Tu pourras les ajuster
              ensuite depuis le module Offres.
            </p>

            <div className="space-y-3 text-sm">
              {offerPremium && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    High Ticket
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {offerPremium.name}
                  </p>
                  <p className="text-xs font-medium text-slate-700">
                    {formatMoney(offerPremium.price_min)} –{" "}
                    {formatMoney(offerPremium.price_max)}
                  </p>
                  {offerPremium.description && (
                    <p className="mt-1 text-xs text-slate-600">
                      {offerPremium.description}
                    </p>
                  )}
                </div>
              )}

              {offerEntry && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Offre principale
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {offerEntry.name}
                  </p>
                  <p className="text-xs font-medium text-slate-700">
                    {formatMoney(offerEntry.price_min)} –{" "}
                    {formatMoney(offerEntry.price_max)}
                  </p>
                  {offerEntry.description && (
                    <p className="mt-1 text-xs text-slate-600">
                      {offerEntry.description}
                    </p>
                  )}
                </div>
              )}

              {offerLeadMagnet && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Lead Magnet
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {offerLeadMagnet.name}
                  </p>
                  {offerLeadMagnet.description && (
                    <p className="mt-1 text-xs text-slate-600">
                      {offerLeadMagnet.description}
                    </p>
                  )}
                </div>
              )}

              {!offerPremium && !offerEntry && !offerLeadMagnet && (
                <p className="text-xs text-slate-500">
                  Aucune offre n&apos;a encore été générée. Elles seront créées
                  automatiquement après ton onboarding.
                </p>
              )}
            </div>
          </div>

          {/* Persona */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Persona cible
            </h3>

            {!mainPersona ? (
              <p className="text-xs text-slate-500">
                Aucun persona n&apos;a encore été généré. Il sera créé automatiquement
                après ton onboarding.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Profil principal</p>
                  <p className="font-medium text-slate-900">
                    {mainPersona.name}
                  </p>
                  {mainPersona.role && (
                    <p className="text-xs text-slate-600">{mainPersona.role}</p>
                  )}
                </div>

                {mainPersona.description && (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Résumé</p>
                    <p className="text-xs text-slate-700">
                      {mainPersona.description}
                    </p>
                  </div>
                )}

                {mainPersona.pains && (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">
                      Problèmes principaux
                    </p>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {mainPersona.pains}
                    </p>
                  </div>
                )}

                {mainPersona.desires && (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">
                      Objectifs & désirs
                    </p>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {mainPersona.desires}
                    </p>
                  </div>
                )}

                {mainPersona.objections && (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">
                      Objections & freins
                    </p>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {mainPersona.objections}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Plan d'action 30/90 jours */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Plan d&apos;action 30/90 jours
              </h3>
              <p className="text-xs text-slate-600">
                Objectifs générés automatiquement à partir de ta situation et de ta
                stratégie. Ils alimenteront ton tableau de suivi.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <GoalsSection title="Phase 1 · 30 jours" goals={goals30d} />
            <GoalsSection title="Phase 2 · 90 jours" goals={goals90d} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
