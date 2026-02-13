// app/settings/page.tsx
// Page Paramètres (pixel-perfect Lovable) : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - UI SettingsTabsShell (client) : mêmes classes/DOM Lovable, sans casser les connexions Tipote

import { redirect } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import SettingsTabsShell from "@/components/settings/SettingsTabsShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type TabKey = "profile" | "connections" | "settings" | "ai" | "pricing";

type Props = {
  searchParams?: { tab?: string };
};

function normalizeTab(v: string | undefined): TabKey {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "profile" || s === "connections" || s === "settings" || s === "ai") return s;
  // compat ancien: tab=billing
  if (s === "billing" || s === "pricing") return "pricing";
  return "profile";
}

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const userEmail = authUser.email ?? "";
  const activeTab = normalizeTab(searchParams?.tab);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4">
              <ProjectSwitcher />
            </div>
            <div className="ml-4">
              <h1 className="text-xl font-display font-bold">Paramètres</h1>
            </div>
          </header>

          <div className="p-6 max-w-5xl mx-auto">
            <SettingsTabsShell userEmail={userEmail} activeTab={activeTab} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
