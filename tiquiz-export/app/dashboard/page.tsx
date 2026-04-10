// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Tableau de bord – Tiquiz" };

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <DashboardClient />;
}
