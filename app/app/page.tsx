// app/app/page.tsx
// Dashboard "Aujourd'hui" — rendu pixel-perfect Lovable (Today.tsx)
// - Protégé par l'auth Supabase
// - Si onboarding non complété => redirect /onboarding
// - Si plan/pyramide manquants => redirect /strategy/pyramids

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import TodayLovable from "@/components/dashboard/TodayLovable";

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const userId = user.id;

  // Onboarding status
  const { data: profile, error: profileError } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile?.onboarding_completed) redirect("/onboarding");

  // Plan stratégique
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("plan_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (planError || !planRow?.plan_json) redirect("/strategy/pyramids");

  const planJson = (planRow.plan_json ?? null) as any;
  const selectedIndex = planJson?.selected_offer_pyramid_index;

  if (selectedIndex === null || typeof selectedIndex === "undefined") {
    redirect("/strategy/pyramids");
  }

  return <TodayLovable />;
}
