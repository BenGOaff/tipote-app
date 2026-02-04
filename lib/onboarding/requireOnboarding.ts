// lib/onboarding/requireOnboarding.ts
// Garde-fou centralisé : si l'utilisateur n'a pas terminé l'onboarding, redirect /onboarding.
// ✅ Fail-open si la DB renvoie une erreur inattendue (évite de bloquer toute l'app).

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function requireOnboarding(userId: string) {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", userId)
    .maybeSingle();

  // Si erreur DB, on ne bloque pas l'app.
  if (error) return;

  const completed = Boolean((data as any)?.onboarding_completed);

  if (!completed) {
    redirect("/onboarding");
  }
}
