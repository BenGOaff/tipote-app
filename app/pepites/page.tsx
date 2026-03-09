// app/pepites/page.tsx
import { redirect } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
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
        <main className="flex-1 flex flex-col">
          <PageHeader
            left={
              <div className="flex flex-col">
                <h1 className="text-lg font-semibold">Pepites</h1>
              </div>
            }
            userEmail={user.email ?? ""}
          />

          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            <PepitesPageClient />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
