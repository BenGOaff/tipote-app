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
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const userId = user.id;

  // ✅ Invariant produit : si pas de plan stratégique => onboarding
  // Or Tipote crée le plan via /api/onboarding/complete dans `business_plan`
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (planError) {
    // En cas d’erreur DB, on évite un false-positive "onboarding incomplet"
    // mais on sécurise l'app (pas de crash page)
    redirect("/onboarding");
  }

  if (!planRow) redirect("/onboarding");

  return <TodayLovable />;
}
