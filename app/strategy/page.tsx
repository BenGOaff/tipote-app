// app/strategy/page.tsx

"use client";

type OfferLevel = {
  label: string;
  price: string;
  description: string;
};

type OfferPyramid = {
  id: string;
  title: string;
  levels: OfferLevel[];
};

type Persona = {
  profile: string;
  pains: string[];
  goals: string[];
};

type StrategyData = {
  objectiveRevenue: string;
  horizon: string;
  progress: number;
  persona: Persona;
  pyramids: OfferPyramid[];
};

const mockStrategy: StrategyData = {
  objectiveRevenue: "50K€/mois",
  horizon: "90 jours",
  progress: 12,
  persona: {
    profile: "Entrepreneur digital 30-45 ans",
    pains: [
      "Manque de temps pour créer du contenu",
      "Stratégie marketing incohérente",
      "Difficulté à générer des leads qualifiés",
    ],
    goals: [
      "Automatiser la création de contenu",
      "Augmenter les revenus de 50%",
      "Développer une audience engagée",
    ],
  },
  pyramids: [
    {
      id: "p1",
      title: "Pyramide 1 - Formation + Coaching",
      levels: [
        {
          label: "High Ticket",
          price: "1997€",
          description: "Programme de coaching stratégique 3 mois",
        },
        {
          label: "Middle Ticket",
          price: "497€",
          description: "Formation complète stratégie de contenu",
        },
        {
          label: "Lead Magnet",
          price: "Gratuit",
          description: "Guide PDF : 10 stratégies de contenus gagnantes",
        },
      ],
    },
    {
      id: "p2",
      title: "Pyramide 2 - Programme en ligne",
      levels: [
        {
          label: "High Ticket",
          price: "1497€",
          description: "Accompagnement premium + communauté",
        },
        {
          label: "Middle Ticket",
          price: "297€",
          description: "Programme en ligne structuré",
        },
        {
          label: "Lead Magnet",
          price: "Gratuit",
          description: "Checklist + mini formation vidéo",
        },
      ],
    },
    {
      id: "p3",
      title: "Pyramide 3 - Service done-for-you",
      levels: [
        {
          label: "High Ticket",
          price: "2997€",
          description: "Service clé en main",
        },
        {
          label: "Middle Ticket",
          price: "797€",
          description: "Audit + plan d’action détaillé",
        },
        {
          label: "Lead Magnet",
          price: "Gratuit",
          description: "Audit express offert",
        },
      ],
    },
  ],
};

export default function StrategyPage() {
  const strategy = mockStrategy;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
          Plan stratégique
        </h1>
        <p className="text-sm text-slate-500">
          Résumé de la stratégie proposée par l&apos;IA à partir de ton
          onboarding.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Votre vision stratégique
        </h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Objectif revenu</p>
            <p className="font-medium text-slate-900">
              {strategy.objectiveRevenue}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Horizon</p>
            <p className="font-medium text-slate-900">
              {strategy.horizon}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Progression</p>
            <p className="font-medium text-slate-900">
              {strategy.progress}%
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            Persona cible
          </h3>
          <p className="text-sm font-medium text-slate-900 mb-2">
            {strategy.persona.profile}
          </p>
          <div className="grid gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-1">
                Problèmes principaux
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-800">
                {strategy.persona.pains.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Objectifs</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-800">
                {strategy.persona.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            Pyramides d&apos;offres proposées (aperçu)
          </h3>
          <p className="text-sm text-slate-600">
            L&apos;IA a généré 3 pyramides d&apos;offres possibles. Dans une
            prochaine étape, tu pourras choisir celle qui te convient et la
            modifier.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {strategy.pyramids.map((pyramid) => (
          <div
            key={pyramid.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h4 className="text-sm font-semibold text-slate-900 mb-3">
              {pyramid.title}
            </h4>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              {pyramid.levels.map((level) => (
                <div
                  key={level.label}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                    {level.label}
                  </p>
                  <p className="text-base font-semibold text-slate-900 mb-1">
                    {level.price}
                  </p>
                  <p className="text-xs text-slate-600">
                    {level.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
