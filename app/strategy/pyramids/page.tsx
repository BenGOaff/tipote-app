// app/strategy/pyramids/page.tsx

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PyramidSelection from "./PyramidSelection";

const ADMIN_FORCE_USER_IDS = new Set<string>([
  // Béné (prod) — autorise /strategy/pyramids?force=1 même en production
  "32d0e96f-f541-4fa4-bb6e-6ea23cdd7532",
]);

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
   * Bypass test :
   * - En dev : /strategy/pyramids?force=1 (comme avant)
   * - En prod : /strategy/pyramids?force=1 uniquement pour ADMIN_FORCE_USER_IDS
   */
  const force = searchParams?.force === "1";
  const isDevBypass = process.env.NODE_ENV !== "production" && force;
  const isAdminProdBypass = process.env.NODE_ENV === "production" && force && ADMIN_FORCE_USER_IDS.has(auth.user.id);
  const isBypass = isDevBypass || isAdminProdBypass;

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
