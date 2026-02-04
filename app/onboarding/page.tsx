// app/onboarding/page.tsx
// Onboarding (obligatoire)
// V2 (chat) par défaut. Legacy accessible via ?legacy=1
// Si déjà complété => redirection dashboard principal

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingChatV2 } from "./OnboardingChatV2";

export default async function OnboardingPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("onboarding_completed, first_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) redirect("/app");

  const legacyParam = props.searchParams?.legacy;
  const legacy = legacyParam === "1" || (Array.isArray(legacyParam) && legacyParam.includes("1"));

  if (legacy) return <OnboardingFlow />;

  return <OnboardingChatV2 firstName={profile?.first_name ?? null} />;
}
