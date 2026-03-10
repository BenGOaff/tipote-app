// app/admin/support/page.tsx
// Admin support center management + ticket inbox
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isAdminEmail } from "@/lib/adminEmails";
import AppShell from "@/components/AppShell";
import AdminSupportClient from "@/components/support/AdminSupportClient";
import AdminTicketsClient from "@/components/support/AdminTicketsClient";
import AdminSupportTabs from "@/components/support/AdminSupportTabs";

export default async function AdminSupportPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? "";
  const userEmail = session?.user?.email ?? "";

  if (!userId) redirect("/");
  if (!isAdminEmail(userEmail)) redirect("/dashboard");

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<div>Support — Administration</div>}
      contentClassName="flex-1 p-4 lg:p-6 space-y-6"
    >
      <AdminSupportTabs
        ticketsTab={<AdminTicketsClient />}
        articlesTab={<AdminSupportClient />}
      />
    </AppShell>
  );
}
