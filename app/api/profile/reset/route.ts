// app/api/profile/reset/route.ts
//
// Per-project reset (Béné feedback Monique 2026-05-04). Reinitializes a
// SINGLE Tipote profile (one project) without touching the user's other
// projects. Distinct from /api/account/reset which wipes everything.
//
// Behavior:
//   • Requires an active project (cookie tipote_active_project)
//   • Refuses if the user has only one project (use /api/account/reset
//     instead — there's nothing to "isolate")
//   • Best-effort deletes rows scoped by (user_id, project_id) across the
//     content / strategy / onboarding / quiz tables. Tables that don't
//     have a project_id column are SKIPPED (we never wipe global rows
//     when targeting a specific project).
//   • Resets the matching business_profiles row to onboarding_completed
//     = false and clears profile fields, but does NOT delete the row
//     (deletion would orphan the project).
//   • Does NOT delete the project itself — that's a separate action via
//     DELETE /api/projects?id=...

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

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

/**
 * Best-effort delete of rows for (user_id, project_id) on a given table.
 * If the table doesn't exist or has no project_id column, we skip silently
 * — we MUST NOT fall back to deleting by user_id alone, that would wipe
 * data from the user's other projects (the bug we're trying to fix).
 */
async function bestEffortDeleteScoped(
  table: string,
  userId: string,
  projectId: string,
) {
  try {
    const res = await supabaseAdmin
      .from(table)
      .delete()
      .eq("user_id", userId)
      .eq("project_id", projectId);
    if (res?.error && !isMissingTableOrColumnError(res.error.message)) {
      console.error(`profile/reset: delete failed on ${table}`, res.error);
    }
  } catch (e) {
    console.error(`profile/reset: unexpected error on ${table}`, e);
  }
}

/**
 * Reset the business_profiles row for (user_id, project_id) — keep the row
 * (the project still exists), but clear profile fields and force re-onboarding.
 */
async function resetBusinessProfile(userId: string, projectId: string) {
  // 1) Critical: force re-onboarding for this project.
  try {
    await supabaseAdmin
      .from("business_profiles")
      .update({
        onboarding_completed: false,
        diagnostic_completed: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("project_id", projectId);
  } catch (e) {
    console.error("profile/reset: critical update threw", e);
  }

  // 2) Clear nullable fields individually so one NOT NULL or missing column
  // doesn't block the rest. Same field list as /api/account/reset to keep
  // behaviour consistent.
  const fieldsToNull = [
    "diagnostic_answers", "diagnostic_profile", "diagnostic_summary",
    "first_name", "country",
    "niche", "mission", "business_maturity", "offers", "has_offers",
    "main_goal", "main_goals", "biggest_blocker", "revenue_goal_monthly",
    "time_available",
    "social_links", "audience_email", "audience_social",
    "content_preference", "preferred_tone",
    "persona", "persona_source",
    "offer_price", "offer_sales_count", "offer_sales_page_links",
    "recent_client_feedback",
    "brand_font", "brand_color_base", "brand_color_accent",
    "brand_tone_of_voice", "brand_logo_url", "brand_author_photo_url",
    "auto_comment_style_ton", "auto_comment_langage", "auto_comment_objectifs",
    "competitor_analysis_summary",
    "privacy_url", "terms_url", "cgv_url",
    "sio_user_api_key",
    "linkedin_url", "instagram_url", "youtube_url", "website_url",
    "activities_list", "primary_activity", "business_model",
    "target_audience_short", "time_available_hours_week",
    "tone", "success_definition", "biggest_challenge",
  ];

  await Promise.allSettled(
    fieldsToNull.map(async (field) => {
      try {
        const res = await supabaseAdmin
          .from("business_profiles")
          .update({ [field]: null })
          .eq("user_id", userId)
          .eq("project_id", projectId);
        if (res?.error && !isMissingTableOrColumnError(res.error.message)) {
          console.warn(`profile/reset: clear ${field} failed (ignored)`, res.error.message);
        }
      } catch {
        // ignore
      }
    }),
  );
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const projectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value?.trim();

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "NO_ACTIVE_PROJECT", message: "Aucun projet actif — utilise /api/account/reset pour tout réinitialiser." },
        { status: 400 },
      );
    }

    // Verify the project belongs to this user (defensive — RLS already enforces).
    const { data: ownedProject } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ownedProject) {
      return NextResponse.json(
        { ok: false, error: "PROJECT_NOT_FOUND" },
        { status: 404 },
      );
    }

    // Refuse the per-project flow if the user only has one project — the
    // global reset (/api/account/reset) is the right primitive then.
    const { data: allProjects } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId);

    if (!allProjects || allProjects.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: "ONLY_ONE_PROJECT",
          message: "Tu n'as qu'un seul Tipote — utilise la réinitialisation complète du compte (Paramètres → Compte) à la place.",
        },
        { status: 400 },
      );
    }

    // Tables to wipe — every one MUST have a project_id column. If it
    // doesn't, the delete is a no-op (skipped silently in
    // bestEffortDeleteScoped). We never fall back to user_id-only.
    const projectScopedTables = [
      // Onboarding
      "onboarding_messages", "onboarding_facts", "onboarding_sessions",
      // Strategy
      "offer_pyramids", "personas", "strategies", "strategy_goals", "business_plan",
      "competitor_analyses",
      // Content / posts / tasks
      "content_item", "content_items", "contents", "generated_contents", "posts",
      "project_tasks", "tasks", "todos", "calendar_events",
      // Analytics
      "metrics", "analytics_events", "offer_metrics",
      // Resources / prompts
      "resources", "resource_chunks", "prompts", "business_blocks",
      // Coach / chat
      "coach_messages", "chat_messages", "chat_sessions",
      // Auto-comment
      "auto_comment_logs",
      // Quiz (CASCADE on quiz_id will handle children)
      "quizzes",
      // Social automations & connections
      "social_automations", "social_connections",
      // Pépites
      "user_pepites", "user_pepites_state",
      // Hosted pages / widgets / clients / webinars
      "hosted_pages", "toast_widgets", "social_share_widgets", "clients", "webinars",
      // Notifications / leads
      "notifications", "leads",
      // Sources / webhooks
      "project_sources", "sio_user_webhooks",
    ];

    await Promise.allSettled(
      projectScopedTables.map((t) => bestEffortDeleteScoped(t, userId, projectId)),
    );

    // Reset the business_profiles row for this project (do NOT delete it —
    // the project itself remains, the row is just blanked).
    await resetBusinessProfile(userId, projectId);

    return NextResponse.json({ ok: true, projectId });
  } catch (err) {
    console.error("Unhandled error in POST /api/profile/reset:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
