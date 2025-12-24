// app/settings/page.tsx
// Page Paramètres : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - AppShell.userEmail est REQUIRED (string) dans le code existant

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import SetPasswordForm from "@/components/SetPasswordForm";
import BillingSection from "@/components/settings/BillingSection";
import ApiKeysManager from "@/components/settings/ApiKeysManager";
import ProfileSection from "@/components/settings/ProfileSection";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Props = {
  searchParams?: { tab?: string };
};

const tabs = [
  { key: "profile", label: "Profil" },
  { key: "settings", label: "Réglages" },
  { key: "ai", label: "IA & API" },
  { key: "billing", label: "Abonnement" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/");
  }

  const userEmail = auth.user.email ?? "";

  const rawTab = (searchParams?.tab ?? "profile") as string;
  const activeTab: TabKey = (tabs.some((t) => t.key === rawTab) ? rawTab : "profile") as TabKey;

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Paramètres</h1>
            <p className="mt-1 text-sm text-slate-600">
              Gérez votre profil, vos préférences, vos clés IA et votre abonnement.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Retour dashboard
          </Link>
        </header>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Link
                key={tab.key}
                href={`/settings?tab=${tab.key}`}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="space-y-4">
          {activeTab === "profile" && <ProfileSection />}

          {activeTab === "settings" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Réglages</h3>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Sécurité : définissez un mot de passe si vous utilisez Google/OTP.
                </p>
                <SetPasswordForm mode="first" />
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Prochaine étape : préférences (langue, notifications) — à brancher si besoin.
                </p>
              </div>
            </section>
          )}

          {activeTab === "ai" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">IA & API</h3>
                <p className="text-xs text-slate-500">
                  Configurez vos clés personnelles (utilisées pour la génération de contenu).
                </p>
              </div>

              <ApiKeysManager />

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Prochaine étape : activer Claude/Gemini dans la génération (backend).
                </p>
              </div>
            </section>
          )}

          {activeTab === "billing" && <BillingSection email={userEmail} />}
        </div>
      </div>
    </AppShell>
  );
}
