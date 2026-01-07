// app/onboarding/page.tsx
// Onboarding (obligatoire) — si déjà complété => redirection dashboard principal

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) redirect("/app");

  return <OnboardingFlow />;
}
