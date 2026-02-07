// app/pepites/page.tsx
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PepitesPageClient from "@/components/pepites/PepitesPageClient";

export default async function PepitesPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1">
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <SidebarTrigger />
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold">Pépites</h1>
              <p className="text-sm text-muted-foreground">
                Des idées et tips à tester (ou pas) ! ✨
              </p>
            </div>
          </div>

          <div className="px-6 py-6">
            <PepitesPageClient />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
