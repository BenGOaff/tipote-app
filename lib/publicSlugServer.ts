// lib/publicSlugServer.ts
//
// Server-only: looks up whether a slug is already taken by content of
// a different type within the SAME (user, project). Tipote has three
// public content types (quizzes, popquizzes, hosted_pages) that share
// the custom-domain URL space (mybrand.com/<slug>), so a collision
// within one project would make the catch-all route ambiguous.
//
// Project-scoped: a quiz in project A and a popquiz in project B can
// share a slug — they live on different custom domains (or different
// /q/... prefixes) and are addressed via their own (user, project)
// resolution path. Only same-project collisions are a problem.
//
// Kept separate from lib/publicSlug.ts because supabaseAdmin pulls in
// the service-role client (Node runtime only) — Edge middleware
// imports the constants from publicSlug.ts but never the lookup.

import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Checks whether ANY OTHER content type owned by this user inside
 * this project already uses `slug`. Pass the type currently being
 * saved so we skip its own table.
 *
 * Returns the offending type when there's a collision (the caller
 * can surface a useful error: "this slug is already used by your
 * popquiz called …"), or null when clear.
 */
export type ContentType = "quiz" | "popquiz" | "hosted_page";

export async function findCrossTypeSlugConflict(
  userId: string,
  projectId: string,
  slug: string,
  selfType: ContentType,
): Promise<ContentType | null> {
  const lower = slug.toLowerCase();

  // Order chosen to match catch-all resolution order (quiz first,
  // popquiz, then hosted_page) so the error message correlates with
  // what would actually serve at the URL.
  if (selfType !== "quiz") {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .ilike("slug", lower)
      .limit(1)
      .maybeSingle();
    if (data) return "quiz";
  }

  if (selfType !== "popquiz") {
    const { data } = await supabaseAdmin
      .from("popquizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .ilike("slug", lower)
      .limit(1)
      .maybeSingle();
    if (data) return "popquiz";
  }

  if (selfType !== "hosted_page") {
    const { data } = await supabaseAdmin
      .from("hosted_pages")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .ilike("slug", lower)
      .limit(1)
      .maybeSingle();
    if (data) return "hosted_page";
  }

  return null;
}
