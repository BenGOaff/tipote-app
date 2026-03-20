// lib/projects/ensureDefaultProject.ts
// Auto-create a default project for users who don't have one yet.
// Used as a self-healing mechanism for beta users who onboarded before multi-project.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ACTIVE_PROJECT_COOKIE } from "./activeProject";
import { cookies } from "next/headers";

export async function ensureDefaultProject(userId: string): Promise<string | null> {
  try {
    // Check if user already has any project
    const { data: existing } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      // Project exists — still backfill any orphan data (legacy rows with project_id=NULL)
      await backfillOrphanData(userId, existing.id);
      return existing.id;
    }

    // No project found: create a default one
    const { data: created, error } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: userId,
        name: "Mon Projet",
        is_default: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !created?.id) return null;

    const projectId = created.id;

    // Backfill ALL orphan data for this user
    await backfillOrphanData(userId, projectId);

    // Set the active project cookie (best-effort in server context)
    try {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_PROJECT_COOKIE, projectId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    } catch {
      // read-only context — ignore
    }

    return projectId;
  } catch {
    return null;
  }
}

/**
 * Backfill all legacy rows (project_id=NULL) for a user into their default project.
 * This ensures beta users who onboarded before multi-project have all their data
 * properly scoped, so creating a second project won't cause data to "disappear".
 */
async function backfillOrphanData(userId: string, projectId: string) {
  const tables = [
    "business_profiles",
    "personas",
    "strategies",
    "business_plan",
    "competitor_analyses",
    "quizzes",
    "social_connections",
    "social_automations",
    "content_item",
    "project_tasks",
    "hosted_pages",
    "auto_comment_logs",
    "offer_metrics",
    "toast_widgets",
    "notifications",
  ];

  await Promise.all(
    tables.map(async (table) => {
      try {
        await supabaseAdmin
          .from(table)
          .update({ project_id: projectId })
          .eq("user_id", userId)
          .is("project_id", null);
      } catch {
        // ignore — table might not have data for this user
      }
    }),
  );
}
