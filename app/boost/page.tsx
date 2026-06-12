// app/boost/page.tsx
//
// Page d'onboarding et de dashboard du pod LinkedIn Tipote. Affiche :
//   - état de l'extension (installée + communique ?)
//   - état du matching LinkedIn (URN détecté + auto-joined dans un pod ?)
//   - karma boosts donnés / reçus
//   - liste des pods actifs
//
// Le bouton "Synchroniser l'extension" envoie un chrome.runtime.sendMessage
// à l'extension (ID dans lib/podBoost.ts) pour qu'elle re-poll son état
// depuis /api/pod/me. Si l'extension n'est pas installée, on affiche
// une CTA "Installer l'extension Chrome" (Phase 2 publication CWS, on
// pointera vers le Web Store quand publié).
//
// Le matching LinkedIn (URN ↔ user_id Tipote) se fait automatiquement
// côté extension dès que le user ouvre LinkedIn — pas d'action manuelle
// requise ici, juste un retour visuel quand c'est fait.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import BoostClient from "@/components/boost/BoostClient";
import { Rocket } from "lucide-react";

export default async function BoostPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Plan pour le gating de l'onglet Réglages (AutoCommentSettings).
  const { data: planRow } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan = String((planRow as { plan?: string | null } | null)?.plan ?? "free");

  const t = await getTranslations("boost");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-background flex flex-col">
          <PageHeader
            left={<h1 className="text-lg font-display font-bold truncate">{t("pageTitle")}</h1>}
            userEmail={user.email ?? ""}
          />
          <div className="flex-1 p-4 sm:p-5 lg:p-6">
            <div className="max-w-[1200px] mx-auto w-full space-y-5">
              <PageBanner
                icon={<Rocket className="w-5 h-5" />}
                title={t("bannerTitle")}
                subtitle={t("bannerSubtitle")}
              />
              <BoostClient userPlan={plan} />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
