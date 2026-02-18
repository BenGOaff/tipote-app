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

    if (existing?.id) return existing.id;

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

    // Link existing business_profiles that have no project_id
    await supabaseAdmin
      .from("business_profiles")
      .update({ project_id: projectId })
      .eq("user_id", userId)
      .is("project_id", null);

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
