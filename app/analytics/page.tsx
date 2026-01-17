// app/analytics/page.tsx
// Analytics — wrapper server minimal (auth) + UI Lovable (client)

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import AnalyticsLovableClient from "@/components/analytics/AnalyticsLovableClient";

export default async function AnalyticsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  return <AnalyticsLovableClient />;
}
