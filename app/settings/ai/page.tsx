// app/settings/page.tsx
// Page Paramètres v2.0 : Profil / Réglages / IA & API / Abonnement (UI prête, logique branchée ensuite)

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
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

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";
  const activeTab =
    tabs.find((t) => t.key === searchParams?.tab)?.key ?? "profile";

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <header>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Paramètres
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gérez votre profil, vos préférences et vos clés IA.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/settings?tab=${t.key}`}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs",
                activeTab === t.key
                  ? "border-[#b042b4] text-[#b042b4] bg-[#b042b4]/5"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {activeTab === "profile" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Profil</h2>
            <p className="text-xs text-slate-500">
              Accès rapide aux éléments liés au compte.
            </p>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/app/account"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs hover:bg-slate-50"
              >
                Sécurité & mot de passe
              </Link>
              <Link
                href="/app/automations"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs hover:bg-slate-50"
              >
                Automatisations (n8n / systeme.io)
              </Link>
            </div>

            <div className="rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-600">
                Email : <span className="font-medium">{userEmail}</span>
              </p>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Réglages</h2>
            <div className="grid gap-4 md:grid-cols-2 text-xs">
              <div>
                <p className="mb-1 text-slate-600">Langue</p>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                  <option>Français</option>
                  <option>Anglais</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-slate-600">Fuseau horaire</p>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                  <option>Europe/Paris</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {activeTab === "ai" && (
          <div className="space-y-4">
            {/* Clés API */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                IA & API
              </h2>
              <p className="text-xs text-slate-500">
                Placeholder UI — on branchera ensuite la sauvegarde (Supabase) et le masquage sécurisé.
              </p>

              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <div>
                  <p className="mb-1 text-slate-600">
                    OpenAI (clé de l&apos;utilisateur)
                  </p>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="sk-..."
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tipote utilisera cette clé pour la génération Niveau 2 (contenus).
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-slate-600">
                    Modèle par défaut
                  </p>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                    <option>Auto</option>
                    <option>gpt-4o-mini</option>
                    <option>gpt-4o</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    On stabilisera ça au moment du branchement OpenAI.
                  </p>
                </div>
              </div>
            </section>

            {/* Préférences */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Préférences de génération
              </h3>

              <div className="grid gap-4 md:grid-cols-3 text-xs">
                <div>
                  <p className="mb-1 text-slate-600">Ton de rédaction</p>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2">
                    <option>Neutre</option>
                    <option>Professionnel</option>
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
        )}

        {activeTab === "billing" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Abonnement</h2>
            <p className="text-xs text-slate-500">
              Placeholder — on branchera l’état d’abonnement (Systeme.io / Stripe / etc.) via tes routes existantes.
            </p>
            <div className="rounded-xl border border-dashed border-slate-200 p-4">
              <p className="text-xs text-slate-600">
                Prochaine étape : afficher le plan, statut, prochain paiement, et actions (upgrade/cancel).
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
