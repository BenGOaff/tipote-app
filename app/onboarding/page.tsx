// app/onboarding/page.tsx
// Onboarding (Lovable 1:1) + guard onboarding_completed

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  const { data: profile, error } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", session.user.id)
    .maybeSingle();

  // Si erreur de lecture, on laisse l'onboarding s'afficher (pas de blocage hard).
  if (!error && profile?.onboarding_completed) redirect("/dashboard");

  return <OnboardingFlow />;
}
