// app/settings/ai/page.tsx
// Page Paramètres IA : gestion des clés API et préférences de génération

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function AISettingsPage() {
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
            Paramètres IA
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure tes clés API et les paramètres de génération de contenus.
          </p>
        </header>

        {/* Configuration des niveaux IA */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Configuration des niveaux IA
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Bientôt, tu pourras activer différents niveaux d&apos;accompagnement
            (Stratégie, Contenus, Automatisations) selon ton abonnement.
          </p>
        </section>

        {/* Clés API */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Clés API de génération
          </h2>

          <div className="grid gap-4 md:grid-cols-2 text-xs">
            <div>
              <p className="mb-1 text-slate-600">OpenAI (clé de l&apos;utilisateur)</p>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="sk-..."
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Ta clé ne sera utilisée que pour générer tes contenus. Tipote ne la
                partagera jamais.
              </p>
            </div>

            <div>
              <p className="mb-1 text-slate-600">Modèle par défaut</p>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option>gpt-4o-mini</option>
                <option>gpt-4.1-mini</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Tu pourras choisir ici le modèle utilisé pour générer tes contenus.
              </p>
            </div>
          </div>
        </section>

        {/* Préférences de génération */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Préférences de génération
          </h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3 text-xs">
            <div>
              <p className="mb-1 text-slate-600">Tonalité par défaut</p>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option>Professionnelle</option>
                <option>Amicale</option>
                <option>Énergique</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-slate-600">Langue principale</p>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option>Français</option>
                <option>Anglais</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-slate-600">Longueur des contenus</p>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option>Court</option>
                <option>Moyen</option>
                <option>Long</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
