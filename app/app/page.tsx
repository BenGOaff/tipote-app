// app/app/page.tsx
// Dashboard "Aujourd'hui" — rendu pixel-perfect Lovable (Today.tsx)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - Si pyramide non choisie => redirect /strategy/pyramids

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

  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (planError) redirect("/onboarding");
  if (!planRow) redirect("/onboarding");

  const planJson = (planRow.plan_json ?? null) as any;
  const selectedIndex = planJson?.selected_offer_pyramid_index;

  if (selectedIndex === null || typeof selectedIndex === "undefined") {
    redirect("/strategy/pyramids");
  }

  return <TodayLovable />;
}
