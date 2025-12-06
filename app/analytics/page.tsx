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
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <header>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Suis les performances de tes contenus et de tes objectifs business.
          </p>
        </header>

        {/* KPIs */}
        <section className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Taux d’ouverture emails", value: "—" },
            { label: "Taux de clics", value: "—" },
            { label: "Leads générés", value: "—" },
            { label: "Ventes", value: "—" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {kpi.value}
              </p>
            </div>
          ))}
        </section>

        {/* Graphes placeholders */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Engagement dans le temps
            </h2>
            <div className="mt-3 h-40 rounded-lg bg-slate-50 border border-dashed border-slate-200" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Progression des objectifs
            </h2>
            <div className="mt-3 h-40 rounded-lg bg-slate-50 border border-dashed border-slate-200" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
