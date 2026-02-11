// app/admin/page.tsx
// Admin dashboard minimal — accessible uniquement à hello@ethilife.fr
// Protégé côté server (redirect) + middleware + API admin

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import AdminUsersPageClient from "@/components/admin/AdminUsersPageClient";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const ADMIN_EMAIL = "hello@ethilife.fr";

export default async function AdminPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? "";
  const userEmail = session?.user?.email ?? "";

  if (!userId) {
    redirect("/");
  }

  if (userEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<div>Admin</div>}
      contentClassName="flex-1 p-4 lg:p-6 space-y-6"
    >
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Gestion manuelle des plans et accès (réservé à {ADMIN_EMAIL}).
        </div>
      </div>

      <AdminUsersPageClient adminEmail={ADMIN_EMAIL} />
    </AppShell>
  );
}
