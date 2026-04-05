// app/pepites/page.tsx
import { redirect } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PepitesPageClient from "@/components/pepites/PepitesPageClient";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function PepitesPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const t = await getTranslations("pepites");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader
            left={
              <h1 className="text-lg font-display font-bold truncate">{t("pageTitle")}</h1>
            }
            userEmail={user.email ?? ""}
          />

          <div className="flex-1 p-4 sm:p-5 lg:p-6">
            <div className="max-w-[1200px] mx-auto w-full space-y-5">
              <PageBanner
                icon={<Sparkles className="w-5 h-5" />}
                title={t("pageTitle")}
                subtitle={t("bannerSubtitle")}
              />
              <PepitesPageClient />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
