// app/calendar/page.tsx
// Page Calendrier éditorial : structure de calendrier mensuel + panneaux latéraux

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default async function CalendarPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        {/* Titre + CTA */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
              Calendrier éditorial
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Visualise et organise tes contenus à publier sur les prochains jours.
            </p>
          </div>
          <button className="rounded-lg bg-[#b042b4] px-4 py-2 text-sm font-medium text-white hover:bg-[#971f97]">
            Ajouter un contenu
          </button>
        </header>

        {/* Grille + panneaux */}
        <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          {/* Calendrier */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Décembre 2025
                </h2>
                <span className="text-xs text-slate-500">
                  Navigation de mois à venir
                </span>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                  Aujourd&apos;hui
                </button>
                <button className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                  Vue semaine
                </button>
              </div>
            </div>

            {/* En-têtes de jours */}
            <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
              {days.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Cases (placeholder) */}
            <div className="grid grid-cols-7 gap-px rounded-lg bg-slate-100 text-xs">
              {Array.from({ length: 35 }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-[72px] bg-white p-1 align-top"
                >
                  <div className="text-[10px] text-slate-400">
                    Jour {index + 1}
                  </div>
                  {/* Future: badges de contenus planifiés */}
                </div>
              ))}
            </div>
          </div>

          {/* Panneaux latéraux */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                À venir cette semaine
              </h3>
              <p className="mt-2 text-xs text-slate-500">
                Quand tu auras planifié des contenus, ils apparaîtront ici avec leur
                date et leur canal.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Statistiques du mois
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                <li>Contenus publiés : 0</li>
                <li>Posts réseaux sociaux : 0</li>
                <li>Emails envoyés : 0</li>
                <li>Taux de complétion du plan : 0%</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
