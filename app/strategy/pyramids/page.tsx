// app/strategy/pyramids/page.tsx

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import PyramidSelection from "./PyramidSelection";

export default async function StrategyPyramidsPage() {
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

  if (typeof planJson?.selected_offer_pyramid_index === "number") {
    redirect("/app");
  }

  return <PyramidSelection />;
}
