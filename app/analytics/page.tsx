// app/analytics/page.tsx
// Page Analytics : KPIs + graphes placeholders

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function AnalyticsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/");
  }

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
              Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Vue d’ensemble des performances (placeholder — on branchera la data ensuite).
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Contenus publiés", value: "—" },
            { label: "Taux de complétion tâches", value: "—" },
            { label: "Leads / semaine", value: "—" },
            { label: "CA estimé", value: "—" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Graphiques</h2>
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-600">Placeholder graphiques (courbes / barres)</p>
            <p className="mt-1 text-xs text-slate-500">
              On branchera : contenus publiés, engagement, progression plan 90 jours, etc.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
