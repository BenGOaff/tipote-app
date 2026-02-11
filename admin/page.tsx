// app/admin/page.tsx
// Admin dashboard (minimal) — accessible uniquement à hello@ethilife.fr
// ✅ SSR auth guard + redirect
// ✅ UI Tipote (AppShell)
// ✅ Data via /api/admin/users (service_role côté serveur)

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import AdminUsersPageClient from "@/components/admin/AdminUsersPageClient";

const ADMIN_EMAIL = "hello@ethilife.fr";

export default async function AdminPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userEmail = session?.user?.email ?? "";

  if (!session?.user?.id) {
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
