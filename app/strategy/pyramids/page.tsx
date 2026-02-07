// app/strategy/pyramids/page.tsx
//
// ✅ IMPORTANT
// Cette route est *désactivée* pour les utilisateurs “normaux”.
// La sélection de pyramide d'offres se fait UNIQUEMENT dans l'onboarding
// (et uniquement pour les users SANS offres et NON affiliés).
//
// Objectif : empêcher qu'un user déjà onboardé (et/ou déjà satisfait de ses offres)
// atterrisse sur une page de pyramides vide.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function StrategyPyramidsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  // ✅ login = "/"
  if (authError || !auth?.user) redirect("/");

  // ✅ Si onboarding non complété => retour vers l'onboarding (c'est là que la sélection se fait)
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  // ✅ Sinon (user déjà onboardé) : on ne montre JAMAIS cette page.
  redirect("/strategy");
}
