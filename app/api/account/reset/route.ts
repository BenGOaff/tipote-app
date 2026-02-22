// app/api/account/reset/route.ts
// Rôle : réinitialiser le compte utilisateur (TOUT sauf crédits IA et abonnement).
// Chaque opération est best-effort pour ne jamais bloquer le reset complet.

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
  column = "user_id",
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

/**
 * Clear business_profiles fields individually so one NOT NULL constraint
 * or missing column doesn't prevent the rest from being cleared.
 */
async function bestEffortClearField(
  userId: string,
  field: string,
  value: unknown = null,
) {
  try {
    const res = await supabaseAdmin
      .from("business_profiles")
      .update({ [field]: value })
      .eq("user_id", userId);

    if (res?.error && !isMissingTableOrColumnError(res.error.message)) {
      console.warn(`reset: business_profiles.${field} clear failed (ignored)`, res.error.message);
    }
  } catch {
    // ignore
  }
}

async function bestEffortResetBusinessProfileAdmin(userId: string) {
  // 1) Critical: force re-onboarding (must succeed)
  try {
    await supabaseAdmin
      .from("business_profiles")
      .update({
        onboarding_completed: false,
        diagnostic_completed: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch (e) {
    console.error("reset: business_profiles critical update threw", e);
  }

  // 2) Clear ALL nullable fields individually (one failure won't block others)
  const fieldsToNull = [
    // Diagnostic / onboarding data
    "diagnostic_answers",
    "diagnostic_profile",
    "diagnostic_summary",

    // Identity
    "first_name",
    "country",

    // Business info
    "niche",
    "mission",
    "business_maturity",
    "offers",
    "has_offers",
    "main_goal",
    "main_goals",
    "biggest_blocker",
    "revenue_goal_monthly",
    "time_available",

    // Audience & social
    "social_links",
    "audience_email",
    "audience_social",

    // Content preferences
    "content_preference",
    "preferred_tone",

    // Persona & offers detail
    "persona",
    "persona_source",
    "offer_price",
    "offer_sales_count",
    "offer_sales_page_links",
    "recent_client_feedback",

    // Branding
    "brand_font",
    "brand_color_base",
    "brand_color_accent",
    "brand_tone_of_voice",
    "brand_logo_url",
    "brand_author_photo_url",

    // Auto-comment settings
    "auto_comment_style_ton",
    "auto_comment_langage",
    "auto_comment_objectifs",

    // Competitor analysis
    "competitor_analysis_summary",

    // Legal / external URLs
    "privacy_url",
    "terms_url",
    "cgv_url",
    "sio_user_api_key",
    "linkedin_url",
    "instagram_url",
    "youtube_url",
    "website_url",

    // Legacy onboarding v2 fields
    "activities_list",
    "primary_activity",
    "business_model",
    "target_audience_short",
    "time_available_hours_week",
    "tone",
    "success_definition",
    "biggest_challenge",
  ];

  // Run all clears in parallel (each is independent & best-effort)
  await Promise.allSettled(
    fieldsToNull.map((field) => bestEffortClearField(userId, field)),
  );
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

    // ✅ Delete all user data from content/strategy/task tables (admin bypass RLS)
    const deletions: Array<{ table: string; column?: string }> = [
      // Onboarding
      { table: "onboarding_messages" },
      { table: "onboarding_facts" },
      { table: "onboarding_sessions" },

      // Strategy / offers / persona / plan
      { table: "offer_pyramids" },
      { table: "personas" },
      { table: "strategies" },
      { table: "strategy_goals" },
      { table: "business_plan" },

      // Competitor analysis
      { table: "competitor_analyses" },

      // Contents / calendar / tasks
      { table: "content_item" },
      { table: "content_items" },
      { table: "contents" },
      { table: "generated_contents" },
      { table: "posts" },
      { table: "project_tasks" },
      { table: "tasks" },
      { table: "todos" },
      { table: "calendar_events" },

      // Analytics / events
      { table: "metrics" },
      { table: "analytics_events" },

      // Resources / knowledge base
      { table: "resources" },
      { table: "resource_chunks" },

      // Prompts & blocks
      { table: "prompts" },
      { table: "business_blocks" },

      // Coach / chat / messages
      { table: "coach_messages" },
      { table: "chat_messages" },
      { table: "chat_sessions" },

      // Auto-comment logs
      { table: "auto_comment_logs" },

      // Quiz data (quiz_questions/results/leads reference quiz_id, delete quizzes last)
      { table: "quiz_results" },
      { table: "quiz_leads" },
      { table: "quiz_questions" },
      { table: "quizzes" },

      // Social connections & automations
      { table: "social_automations" },
      { table: "social_connections" },

      // Pepites (tips/insights)
      { table: "user_pepites" },
      { table: "user_pepites_state" },

      // Plan change log (uses target_user_id)
      { table: "plan_change_log", column: "target_user_id" },
    ];

    // Suppression via admin (bypass RLS)
    await Promise.allSettled(
      deletions.map((d) =>
        bestEffortDeleteByUserId(supabaseAdmin, d.table, userId, d.column ?? "user_id"),
      ),
    );

    // Fallback: owner_id (some legacy tables may use owner_id instead of user_id)
    const ownerTables = [
      "contents", "content_items", "content_item", "tasks", "todos", "posts",
      "project_tasks", "resources", "prompts", "business_plan", "strategies",
      "personas", "offer_pyramids", "onboarding_sessions", "onboarding_facts",
      "onboarding_messages", "competitor_analyses", "coach_messages",
      "auto_comment_logs", "plan_change_log",
    ];
    await Promise.allSettled(
      ownerTables.map((t) =>
        bestEffortDeleteByUserId(supabaseAdmin, t, userId, "owner_id"),
      ),
    );

    // ✅ Reset business_profiles (clear ALL fields individually)
    await bestEffortResetBusinessProfileAdmin(userId);

    // ✅ Ensure profiles row exists (FK guard for onboarding_sessions)
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
          onboarding_version: "v3",
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
      { status: 500 },
    );
  }
}
