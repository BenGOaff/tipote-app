// app/api/strategy/offer-pyramid/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PATCH(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Compat payloads:
    // - Nouveau (Lovable /strategy/pyramids): { selectedIndex, pyramid }
    // - Ancien (StrategyClient legacy): { selected_offer_pyramid_index, selected_offer_pyramid }
    const selectedIndex =
      typeof (body as any)?.selectedIndex === "number"
        ? (body as any).selectedIndex
        : typeof (body as any)?.selected_offer_pyramid_index === "number"
          ? (body as any).selected_offer_pyramid_index
          : undefined;

    const pyramid =
      (body as any)?.pyramid ?? (body as any)?.selected_offer_pyramid ?? undefined;

    if (!pyramid || typeof selectedIndex !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Charger le business_plan actuel
    const { data: planRow, error: planError } = await supabase
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (planError) {
      console.error("Error loading business_plan:", planError);
      return NextResponse.json({ error: "Failed to load business plan" }, { status: 500 });
    }

    if (!planRow) {
      return NextResponse.json({ error: "Business plan not found" }, { status: 404 });
    }

    const currentPlan = (planRow.plan_json || {}) as Record<string, any>;
    const currentIndex = currentPlan.selected_offer_pyramid_index as number | null | undefined;

    // Logique de verrouillage :
    // - si aucune pyramide choisie → on accepte l'index (CHOIX INITIAL)
    // - si déjà une pyramide choisie → on refuse tout changement d'index
    if (currentIndex === undefined || currentIndex === null) {
      // Premier choix
      currentPlan.selected_offer_pyramid_index = selectedIndex;
      currentPlan.selected_offer_pyramid = pyramid;
    } else {
      // Pyramide déjà choisie
      if (currentIndex !== selectedIndex) {
        return NextResponse.json(
          {
            error:
              "Une pyramide est déjà choisie. Tu peux modifier son contenu, mais pas changer de scénario.",
          },
          { status: 409 },
        );
      }
      // Index identique → on met simplement à jour le contenu
      currentPlan.selected_offer_pyramid = pyramid;
    }

    const { error: updateError } = await supabase
      .from("business_plan")
      .update({
        plan_json: currentPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRow.id)
      .eq("user_id", session.user.id);

    if (updateError) {
      console.error("Error updating business_plan:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      plan_json: currentPlan,
    });
  } catch (err) {
    console.error("Unhandled error in PATCH /api/strategy/offer-pyramid:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
