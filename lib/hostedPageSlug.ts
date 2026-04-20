// lib/hostedPageSlug.ts
// Server-side guard: ensure a published hosted page slug is globally unique.
//
// WHY THIS EXISTS
// ---------------
// 20260301_hosted_pages.sql declares the slug index as `(user_id, slug)`,
// i.e. unique per user. The public route `/p/[slug]` selects by slug only and
// returns the most-recently-created published row. Two users publishing the
// same slug therefore "share" the URL: only one wins, the other becomes
// invisible. Worse, generateMetadata also resolves to the squatting row, so
// OG tags / titles get hijacked too.
//
// We can't safely add a global unique index in a migration without first
// resolving any existing duplicates, so this runtime check enforces the
// invariant defensively until the DB-level constraint is in place.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SlugConflict = {
  conflict: true;
  /** ID of the existing published page that owns this slug. */
  existingPageId: string;
};

export type SlugFree = { conflict: false };

/**
 * Check whether `slug` is already used by a different user's published
 * hosted page.
 *
 * - Returns `{ conflict: false }` when free, or when the only matching
 *   published row is `currentPageId` itself (republishing same page).
 * - Caller must use a service-role / admin client when checking across
 *   users — the standard server client only sees rows the user owns.
 */
export async function checkPublishedSlugAvailable(
  adminClient: SupabaseClient,
  slug: string,
  currentPageId: string,
): Promise<SlugConflict | SlugFree> {
  if (!slug) return { conflict: false };

  const { data, error } = await adminClient
    .from("hosted_pages")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .neq("id", currentPageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Fail open: don't block a user save because we can't verify uniqueness.
    // The DB unique index (once safe to deploy) will catch this anyway.
    console.warn("[checkPublishedSlugAvailable] lookup failed", { slug, error: error.message });
    return { conflict: false };
  }

  if (data?.id) {
    return { conflict: true, existingPageId: data.id as string };
  }
  return { conflict: false };
}
