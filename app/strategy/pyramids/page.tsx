// app/strategy/pyramids/page.tsx

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PyramidSelection from "./PyramidSelection";

export default async function StrategyPyramidsPage({
  searchParams,
}: {
  searchParams?: { force?: string };
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) redirect("/");

  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("plan_json")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (planError || !planRow?.plan_json) {
    redirect("/onboarding");
  }

  const planJson = planRow.plan_json as any;

  /**
   * Dev/test bypass:
   * - Avant: seulement en non-prod
   * - Maintenant: autorisé en prod MAIS uniquement pour un user test (toi),
   *   pour pouvoir retester le flow sans créer 50 fake profils.
   */
  const TEST_USER_IDS_ALLOW_FORCE_BYPASS = new Set<string>([
    "32d0e96f-f541-4fa4-bb6e-6ea23cdd7532", // Béné (test)
  ]);

  const isForce = searchParams?.force === "1";
  const isAllowedTester = TEST_USER_IDS_ALLOW_FORCE_BYPASS.has(auth.user.id);

  const isDevBypass = process.env.NODE_ENV !== "production" && isForce;
  const isProdTesterBypass = process.env.NODE_ENV === "production" && isForce && isAllowedTester;

  const isBypass = isDevBypass || isProdTesterBypass;

  // Blocage normal (user réel) : si une pyramide a déjà été choisie, on renvoie vers l’app
  // Compat: accepte plusieurs clés possibles (au cas où)
  const selectedIndex =
    typeof planJson?.selected_offer_pyramid_index === "number"
      ? planJson.selected_offer_pyramid_index
      : typeof planJson?.selected_pyramid_index === "number"
        ? planJson.selected_pyramid_index
        : null;

  const hasSelectedPyramidObject = !!planJson?.selected_offer_pyramid || !!planJson?.selected_pyramid;

  if (!isBypass && (typeof selectedIndex === "number" || hasSelectedPyramidObject)) {
    redirect("/app");
  }

  return <PyramidSelection />;
}
