// app/dashboard/page.tsx
// Dashboard pixel-perfect (Lovable Today.tsx) — route de test
// - Auth Supabase obligatoire
// - UI 1:1 via component client TodayLovable

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import TodayLovable from "@/components/dashboard/TodayLovable";

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  return <TodayLovable />;
}
