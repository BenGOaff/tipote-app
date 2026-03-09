// app/settings/page.tsx
// Page Paramètres : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - UI SettingsTabsShell (client)

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import SettingsTabsShell from "@/components/settings/SettingsTabsShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type TabKey = "profile" | "connections" | "settings" | "positioning" | "branding" | "ai" | "pricing";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeTab(v: string | undefined): TabKey {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "profile" || s === "connections" || s === "settings" || s === "positioning" || s === "branding" || s === "ai") return s;
  // compat ancien: tab=billing
  if (s === "billing" || s === "pricing") return "pricing";
  return "profile";
}

export default async function SettingsPage({ searchParams }: Props) {
  const [supabase, t] = await Promise.all([
    getSupabaseServerClient(),
    getTranslations("settings"),
  ]);
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const sp = await searchParams;
  const userEmail = authUser.email ?? "";
  const activeTab = normalizeTab(sp?.tab as string | undefined);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader
            left={<h1 className="text-lg font-display font-bold truncate">{t("title")}</h1>}
            userEmail={userEmail}
          />

          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            <SettingsTabsShell userEmail={userEmail} activeTab={activeTab} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
