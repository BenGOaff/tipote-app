// app/settings/page.tsx
// Page Paramètres (pixel-perfect Lovable) : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - UI SettingsTabsShell (client) : mêmes classes/DOM Lovable, sans casser les connexions Tipote

import { redirect } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import SettingsTabsShell from "@/components/settings/SettingsTabsShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Props = {
  searchParams?: { tab?: string };
};

type TabKey = "profile" | "settings" | "ai" | "billing";

function normalizeTab(v: unknown): TabKey {
  if (typeof v !== "string") return "profile";
  const s = v.trim().toLowerCase();
  if (s === "profile" || s === "settings" || s === "ai" || s === "billing") return s;
  return "profile";
}

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) redirect("/");

  const userEmail = auth.user.email ?? "";
  const activeTab = normalizeTab(searchParams?.tab);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
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
