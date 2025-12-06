// app/content-hub/page.tsx
// Page Content Hub : stats de contenus + liste des contenus + CTA génération IA

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function ContentHubPage() {
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
              Content Hub
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Tous tes contenus centralisés : posts, emails, vidéos et ressources.
            </p>
          </div>
          <button className="rounded-lg bg-[#b042b4] px-4 py-2 text-sm font-medium text-white hover:bg-[#971f97]">
            Nouveau contenu
          </button>
        </header>

        {/* Stats de contenus */}
        <section className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Contenus", value: "0" },
            { label: "Posts", value: "0" },
            { label: "Emails", value: "0" },
            { label: "Brouillons", value: "0" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {/* Liste de contenus (placeholder) */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Tous tes contenus
            </h2>
            <div className="text-xs text-slate-500">Filtrage et recherche à venir</div>
          </div>

          <div className="border-t border-slate-100 pt-4 text-sm text-slate-500">
            Tu n&apos;as pas encore créé de contenu. Utilise la génération IA pour
            commencer à produire des posts, emails et autres formats alignés avec ta
            stratégie.
          </div>
        </section>

        {/* Bandeau génération IA */}
        <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-[#b042b4] to-[#6b21a8] p-[1px] shadow-sm">
          <div className="flex flex-col gap-3 rounded-[10px] bg-slate-900/95 px-4 py-4 text-slate-50 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Générer du contenu en quelques clics
              </h3>
              <p className="mt-1 text-xs md:text-sm text-slate-200">
                Utilise l&apos;IA de Tipote pour créer des contenus alignés à ta
                stratégie : posts, emails, scripts vidéo et plus encore.
              </p>
            </div>
            <button className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100">
              Ouvrir le module Génération IA
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
