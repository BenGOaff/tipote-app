// app/automations/page.tsx
// Automatisations sociales — wrapper server minimal (auth) + UI client

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import AutomationsLovableClient from "@/components/automations/AutomationsLovableClient";

export default async function AutomationsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  return <AutomationsLovableClient />;
}
