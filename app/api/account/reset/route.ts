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
  /**
   * IMPORTANT (anti-régression & basé sur tes logs Supabase)
   * - La colonne business_profiles.onboarding_version est NOT NULL (log: "null value in column onboarding_version")
   * - Donc on NE DOIT PAS la mettre à null pendant un reset.
   *
   * Objectif reset:
   * - Forcer onboarding_completed=false (et diagnostic_completed=false) => middleware + /app redirect vers /onboarding
   * - Best-effort sur les autres champs (sans jamais bloquer le reset)
   */

  // 1) Minimal, doit réussir à coup sûr (ne touche pas aux colonnes contraintes)
  try {
    const updMin = await supabaseAdmin
      .from("business_profiles")
      .update({
        onboarding_completed: false,
        diagnostic_completed: false,
      })
      .eq("user_id", userId);

    if (updMin?.error) {
      if (!isMissingTableOrColumnError(updMin.error.message)) {
        console.error("reset: business_profiles minimal update failed", updMin.error);
      }
      // Même si ça échoue, on tente quand même la suite (best-effort)
    }
  } catch (e) {
    console.error("reset: business_profiles minimal update threw", e);
  }

  // 2) Optional best-effort : vider les champs diagnostics (normalement nullable)
  // ⚠️ ne jamais toucher onboarding_version / persona_source ici.
  try {
    const updDiag = await supabaseAdmin
      .from("business_profiles")
      .update({
        diagnostic_answers: null,
        diagnostic_profile: null,
        diagnostic_summary: null,
      })
      .eq("user_id", userId);

    if (updDiag?.error && !isMissingTableOrColumnError(updDiag.error.message)) {
      console.warn("reset: business_profiles diagnostic clear failed (ignored)", updDiag.error);
    }
  } catch (e) {
    console.warn("reset: business_profiles diagnostic clear threw (ignored)", e);
  }

  // 3) Optional best-effort : nettoyer quelques champs onboarding typiquement nullable
  // (si un champ est NOT NULL côté DB, l’update échouera mais on ignore)
  try {
    const updSoft = await supabaseAdmin
      .from("business_profiles")
      .update({
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
        content_preference: null,
        preferred_tone: null,
        persona: null,
        offer_price: null,
        offer_sales_count: null,
        offer_sales_page_links: null,
        // ✅ Champs onboarding v2 (récap + extracteurs) — best-effort
        activities_list: null,
        primary_activity: null,
        business_model: null,
        target_audience_short: null,
        revenue_goal_monthly: null,
        time_available_hours_week: null,
        tone: null,
      })
      .eq("user_id", userId);

    if (updSoft?.error && !isMissingTableOrColumnError(updSoft.error.message)) {
      console.warn("reset: business_profiles soft clear failed (ignored)", updSoft.error);
    }
  } catch (e) {
    console.warn("reset: business_profiles soft clear threw (ignored)", e);
  }
}

export async function POST() {
  const supabase = await getSupabaseServerClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Delete best-effort (admin bypass)
    const deletions: Array<{ table: string; column?: string }> = [
      // Onboarding v2
      { table: "onboarding_messages", column: "user_id" }, // best-effort si colonne existe
      { table: "onboarding_facts", column: "user_id" },
      { table: "onboarding_sessions", column: "user_id" },

      // Onboarding / stratégie / offres (legacy table) / persona / plan business (regénérables)
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

    // ✅ Forcer le retour onboarding (sans casser NOT NULL onboarding_version)
    await bestEffortResetBusinessProfileAdmin(userId);

    // ✅ Ensure profiles row exists (FK guard for onboarding_sessions)
    // For old users or edge cases, the profiles row may not exist.
    try {
      const { data: profileExists } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (!profileExists) {
        const { data: authUser } = await supabase.auth.getUser();
        await supabaseAdmin.from("profiles").insert({
          id: userId,
          email: authUser?.user?.email ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("reset: profiles ensure failed (non-blocking):", e);
    }

    // ✅ Ensure business_profiles row exists (required for onboarding)
    try {
      const { data: bpExists } = await supabaseAdmin
        .from("business_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!bpExists) {
        await supabaseAdmin.from("business_profiles").insert({
          user_id: userId,
          onboarding_completed: false,
          onboarding_version: "v2",
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("reset: business_profiles ensure failed (non-blocking):", e);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in POST /api/account/reset:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
