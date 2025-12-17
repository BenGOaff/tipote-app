// app/settings/page.tsx
// Page Paramètres v2.1 : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase
// - IA & API : gestion clé OpenAI (chiffrée) via /api/user/api-keys

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import SetPasswordForm from "@/components/SetPasswordForm";
import OpenAIKeyManager from "@/components/settings/OpenAIKeyManager";

type Props = {
  searchParams?: { tab?: string };
};

const tabs = [
  { key: "profile", label: "Profil" },
  { key: "settings", label: "Réglages" },
  { key: "ai", label: "IA & API" },
  { key: "billing", label: "Abonnement" },
] as const;

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const activeTab = (searchParams?.tab ?? "profile") as (typeof tabs)[number]["key"];

  return (
    <AppShell userEmail={userEmail} headerTitle="Paramètres">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">Paramètres</h1>
          <p className="text-sm text-slate-500">Gérez votre compte et vos préférences.</p>
        </header>

        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Link
                key={tab.key}
                href={`/settings?tab=${tab.key}`}
                className={
                  isActive
                    ? "rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white"
                    : "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {activeTab === "profile" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Profil</h3>
            <p className="text-xs text-slate-500">
              Placeholder — on branchera ensuite les infos profil (Supabase).
            </p>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-600">
                Email : <span className="font-medium">{userEmail}</span>
              </p>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Sécurité</h3>
            <p className="text-xs text-slate-500">
              Modifiez votre mot de passe (réutilise le composant existant).
            </p>
            <div className="rounded-xl border border-slate-100 p-4">
              {/* ✅ Fix TS : SetPasswordForm exige la prop "mode" */}
              <SetPasswordForm mode="reset" />
            </div>
          </section>
        )}

        {activeTab === "ai" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">IA & API</h3>
            <p className="text-xs text-slate-500">
              Configurez vos clés personnelles (utilisées pour la génération de contenu).
            </p>

            <OpenAIKeyManager />

            <div className="rounded-xl border border-dashed border-slate-200 p-4">
              <p className="text-xs text-slate-600">
                Prochaine étape : ajouter Claude/Gemini + sélecteur provider dans “Créer”.
              </p>
            </div>
          </section>
        )}

        {activeTab === "billing" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Abonnement</h3>
            <p className="text-xs text-slate-500">
              Placeholder — tu as déjà des routes API billing, on branchera l’affichage ici.
            </p>
            <div className="rounded-xl border border-dashed border-slate-200 p-4">
              <p className="text-xs text-slate-600">
                Prochaine étape : plan, statut, prochain paiement, upgrade/cancel.
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
