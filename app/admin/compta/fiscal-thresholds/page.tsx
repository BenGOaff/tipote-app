// app/admin/compta/fiscal-thresholds/page.tsx
//
// Page admin pour visualiser + éditer les seuils fiscaux que le
// dashboard compta affiche aux users. Accessible uniquement aux
// emails de ADMIN_EMAILS.
//
// Le cron quotidien check-fiscal-thresholds envoie un email avec
// un lien direct vers cette page quand il détecte qu'un seuil
// stocké n'est plus présent sur la page officielle.

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isAdminEmail } from "@/lib/adminEmails";
import FiscalThresholdsAdminClient from "@/components/admin/FiscalThresholdsAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seuils fiscaux — Admin Tipote" };

export default async function FiscalThresholdsAdminPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userEmail = session?.user?.email ?? "";
  if (!session?.user?.id) redirect("/");
  if (!isAdminEmail(userEmail)) redirect("/dashboard");

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<div>Admin · Seuils fiscaux</div>}
      contentClassName="flex-1 p-4 lg:p-6"
    >
      <FiscalThresholdsAdminClient />
    </AppShell>
  );
}
