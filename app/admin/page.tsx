// app/admin/page.tsx
// Admin dashboard — accessible uniquement aux emails autorisés
// Protégé côté server (redirect) + middleware + API admin

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import AdminUsersPageClient from "@/components/admin/AdminUsersPageClient";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isAdminEmail } from "@/lib/adminEmails";

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

  if (!isAdminEmail(userEmail)) {
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
          Gestion manuelle des plans, crédits et accès.
        </div>
      </div>

      <AdminUsersPageClient adminEmail={userEmail} />
    </AppShell>
  );
}
