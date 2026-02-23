// app/strategy/pyramids/page.tsx
// Page de selection des pyramides d'offres.
// Accessible apres l'onboarding pour les utilisateurs sans offres (non affilies).
// Genere les pyramides puis les affiche pour selection.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PyramidSelection from "./PyramidSelection";

export default async function StrategyPyramidsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) redirect("/");

  return <PyramidSelection />;
}
