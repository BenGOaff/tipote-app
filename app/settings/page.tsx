// app/settings/page.tsx
// Page Paramètres : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - AppShell.userEmail est REQUIRED (string) dans le code existant

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import SetPasswordForm from "@/components/SetPasswordForm";
import OpenAIKeyManager from "@/components/settings/OpenAIKeyManager";
import BillingSection from "@/components/settings/BillingSection";
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

  // ✅ AppShell attend un string (pas undefined)
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
          {activeTab === "profile" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Profil</h3>

              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Email : <span className="font-medium text-slate-900">{userEmail || "—"}</span>
                </p>
                <p className="text-xs text-slate-600">
                  ID : <span className="font-mono text-slate-900">{auth.user.id}</span>
                </p>
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Prochaine étape : édition du profil business (business_profiles).
                </p>
              </div>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Réglages</h3>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Sécurité : définissez un mot de passe si vous utilisez Google/OTP.
                </p>
                {/* ✅ conforme au code existant : mode requis ('first' | 'reset') */}
                <SetPasswordForm mode="first" />
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Prochaine étape : préférences (langue, ton, notifications).
                </p>
              </div>
            </section>
          )}

          {activeTab === "ai" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">IA & API</h3>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Gérez votre clé OpenAI (chiffrée). Elle est utilisée pour la génération de contenu.
                </p>
                <OpenAIKeyManager />
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-xs text-slate-600">
                  Prochaine étape : ajouter Claude/Gemini + sélection provider par module.
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
