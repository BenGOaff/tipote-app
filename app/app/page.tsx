// app/app/page.tsx
// Dashboard "Aujourd'hui" — rendu pixel-perfect Lovable (Today.tsx)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import TodayLovable from "@/components/dashboard/TodayLovable";

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const userId = user.id;

  // Garde l’invariant historique : si pas de plan stratégique => onboarding
  const { data: planRow } = await supabase
    .from("strategic_plan")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!planRow) redirect("/onboarding");

  return <TodayLovable />;
}
