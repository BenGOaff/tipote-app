// app/api/account/reset/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isMissingTableOrColumnError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    (m.includes("column") && (m.includes("does not exist") || m.includes("unknown"))) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

async function bestEffortDeleteByUserId(
  supabase: any,
  table: string,
  userId: string,
  column = "user_id"
) {
  try {
    const res = await supabase.from(table).delete().eq(column, userId);
    if (res?.error) {
      if (!isMissingTableOrColumnError(res.error.message)) {
        console.error(`reset: delete failed on ${table}.${column}`, res.error);
      }
    }
  } catch (e) {
    console.error(`reset: unexpected error on ${table}.${column}`, e);
  }
}

async function bestEffortResetBusinessProfileAdmin(userId: string) {
  // Objectif: forcer le retour onboarding à coup sûr (bypass RLS via service_role)
  // On ne supprime pas forcément la ligne: on remet les flags/infos onboarding à zéro.
  const payload: Record<string, any> = {
    onboarding_completed: false,

    // Reset diagnostic si présent (vu dans tes rows)
    diagnostic_completed: false,
    diagnostic_answers: null,
    diagnostic_profile: null,
    diagnostic_summary: null,

    // Reset champs onboarding usuels
    first_name: null,
    country: null,
    niche: null,
    mission: null,
    business_maturity: null,
    offers: null,
    main_goal: null,
    main_goals: null,
    success_definition: null,
    biggest_challenge: null,
    recent_client_feedback: null,
    biggest_blocker: null,
    has_offers: null,

    // Préférences contenu
    content_preference: null,
    preferred_tone: null,

    // Persona / offre
    persona: null,
    offer_price: null,
    offer_sales_count: null,
    offer_sales_page_links: null,

    // Champs onboarding “version”
    onboarding_version: null,
    persona_source: null,
  };

  try {
    const upd = await supabaseAdmin
      .from("business_profiles")
      .update(payload)
      .eq("user_id", userId);

    if (upd?.error) {
      // Si certaines colonnes n’existent pas (env diff), on retombe en minimal.
      if (isMissingTableOrColumnError(upd.error.message)) {
        const upd2 = await supabaseAdmin
          .from("business_profiles")
          .update({ onboarding_completed: false, diagnostic_completed: false })
          .eq("user_id", userId);

        if (upd2?.error && !isMissingTableOrColumnError(upd2.error.message)) {
          console.error("reset: business_profiles minimal update failed", upd2.error);
        }
        return;
      }

      console.error("reset: business_profiles update failed", upd.error);
    }
  } catch (e) {
    console.error("reset: business_profiles update threw", e);
  }
}

export async function POST() {
  try {
    // ✅ Auth via cookies (user session)
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = user.id;

    /**
     * IMPORTANT — RESET "SOFT" (ONBOARDING)
     * - ✅ On supprime uniquement les données générées / contenus / tâches / stratégie / onboarding
     * - ❌ On ne touche PAS aux crédits, abonnement, ni auth user
     *
     * ✅ On utilise supabaseAdmin (service_role) pour BYPASS RLS
     * sinon business_profiles.onboarding_completed reste à true (ce que tu observes).
     */

    const deletions: Array<{ table: string; column?: string }> = [
      // Onboarding V2 (sessions/messages/facts) — regénérable
      { table: "onboarding_messages", column: "user_id" }, // best-effort si colonne existe
      { table: "onboarding_facts", column: "user_id" },
      { table: "onboarding_sessions", column: "user_id" },

      // Onboarding / stratégie / pyramides / persona / plan business (regénérables)
      { table: "offer_pyramids", column: "user_id" },
      { table: "personas", column: "user_id" },
      { table: "strategies", column: "user_id" },
      { table: "strategy_goals", column: "user_id" },
      { table: "business_plan", column: "user_id" },

      // Contenus / calendriers / tâches (regénérables)
      { table: "content_item", column: "user_id" },
      { table: "content_items", column: "user_id" },
      { table: "contents", column: "user_id" },
      { table: "generated_contents", column: "user_id" },
      { table: "posts", column: "user_id" },
      { table: "project_tasks", column: "user_id" },
      { table: "tasks", column: "user_id" },
      { table: "todos", column: "user_id" },
      { table: "calendar_events", column: "user_id" },

      // Analytics / events (recalculables)
      { table: "metrics", column: "user_id" },
      { table: "analytics_events", column: "user_id" },

      // Ressources / base de connaissances (recréables)
      { table: "resources", column: "user_id" },
      { table: "resource_chunks", column: "user_id" },

      // Prompts & blocks (réglages de contenu / templates utilisateur)
      { table: "prompts", column: "user_id" },
      { table: "business_blocks", column: "user_id" },
    ];

    // ✅ Suppression via admin (bypass RLS)
    for (const d of deletions) {
      await bestEffortDeleteByUserId(supabaseAdmin, d.table, userId, d.column ?? "user_id");
    }

    // Fallback owner_id (certaines tables historiques peuvent utiliser owner_id)
    const ownerTables = [
      "contents",
      "content_items",
      "content_item",
      "tasks",
      "todos",
      "posts",
      "project_tasks",
      "resources",
      "prompts",
      "business_plan",
      "strategies",
      "personas",
      "offer_pyramids",
      "onboarding_sessions",
      "onboarding_facts",
      "onboarding_messages",
    ];
    for (const t of ownerTables) {
      await bestEffortDeleteByUserId(supabaseAdmin, t, userId, "owner_id");
    }

    // ✅ Forcer le retour onboarding
    await bestEffortResetBusinessProfileAdmin(userId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in POST /api/account/reset:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
