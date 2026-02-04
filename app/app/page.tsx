// app/app/page.tsx
// Dashboard "Aujourd'hui" — rendu pixel-perfect Lovable (Today.tsx)
// - Protégé par l'auth Supabase
// - Si onboarding non complété => redirect /onboarding
// NOTE: on NE bloque plus sur la stratégie/pyramide ici.
// L'utilisateur arrive sur un dashboard immédiatement (objectif: expérience personnalisée),
// et la stratégie/pyramide se gère ensuite dans /strategy.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import TodayLovable from "@/components/dashboard/TodayLovable";

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/");

  const userId = user.id;

  // Onboarding status
  const { data: profile, error: profileError } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile?.onboarding_completed) redirect("/onboarding");

  return <TodayLovable />;
}
