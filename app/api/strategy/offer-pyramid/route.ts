// app/api/strategy/offer-pyramid/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function PATCH(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as any;

    // Compat payloads:
    // - Nouveau (Lovable /strategy/pyramids): { selectedIndex, pyramid }
    // - Ancien (StrategyClient legacy): { selected_offer_pyramid_index, selected_offer_pyramid }
    const selectedIndex =
      typeof body?.selectedIndex === "number"
        ? body.selectedIndex
        : typeof body?.selected_offer_pyramid_index === "number"
          ? body.selected_offer_pyramid_index
          : undefined;

    // Peut être absent : on prendra la pyramide depuis plan_json.offer_pyramids[selectedIndex]
    const pyramid = body?.pyramid ?? body?.selected_offer_pyramid ?? undefined;

    if (typeof selectedIndex !== "number" || selectedIndex < 0) {
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

    const offerPyramids = Array.isArray(currentPlan.offer_pyramids) ? currentPlan.offer_pyramids : [];
    if (offerPyramids.length > 0 && selectedIndex >= offerPyramids.length) {
      return NextResponse.json({ error: "selectedIndex out of range" }, { status: 400 });
    }

    const chosenPyramid =
      pyramid !== undefined
        ? pyramid
        : offerPyramids.length > 0
          ? offerPyramids[selectedIndex]
          : undefined;

    if (!chosenPyramid || (!isRecord(chosenPyramid) && !Array.isArray(chosenPyramid))) {
      // On accepte record/array (selon format), mais pas undefined
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Logique de verrouillage :
    // - si aucune pyramide choisie → on accepte l'index (CHOIX INITIAL)
    // - si déjà une pyramide choisie → on refuse tout changement d'index
    if (currentIndex === undefined || currentIndex === null) {
      // Premier choix
      currentPlan.selected_offer_pyramid_index = selectedIndex;
      currentPlan.selected_offer_pyramid = chosenPyramid;

      // Compat (au cas où)
      currentPlan.selected_pyramid_index = selectedIndex;
      currentPlan.selected_pyramid = chosenPyramid;
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
      currentPlan.selected_offer_pyramid = chosenPyramid;
      currentPlan.selected_pyramid = chosenPyramid;
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
