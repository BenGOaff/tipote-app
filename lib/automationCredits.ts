// lib/automationCredits.ts
// Constants and helpers for auto-comments feature.
// Credits are consumed from the standard AI credits pool (user_credits table).

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** AI credit cost per auto-comment */
export const CREDIT_PER_COMMENT = 0.25;

/** Max comments before/after a post */
export const MAX_COMMENTS_BEFORE = 5;
export const MAX_COMMENTS_AFTER = 5;

/** Max auto-comments per user per day per platform (anti-spam) */
export const MAX_DAILY_COMMENTS_PER_PLATFORM = 20;

/** Comment angles for AI variation */
export const COMMENT_ANGLES = [
  "d_accord",
  "pas_d_accord",
  "approfondir",
  "poser_question",
  "partager_experience",
] as const;

export type CommentAngle = (typeof COMMENT_ANGLES)[number];

/** Style/ton options */
export const STYLE_TONS = [
  "amical",
  "professionnel",
  "provocateur",
  "storytelling",
  "humoristique",
  "sérieux",
] as const;

export type StyleTon = (typeof STYLE_TONS)[number];

/** Objectif options */
export const OBJECTIFS = [
  "éduquer",
  "vendre",
  "divertir",
  "inspirer",
  "construire_communaute",
] as const;

export type Objectif = (typeof OBJECTIFS)[number];

/**
 * Calculate total AI credits needed for a given auto-comment config.
 */
export function calculateCreditsNeeded(nbBefore: number, nbAfter: number): number {
  return (nbBefore + nbAfter) * CREDIT_PER_COMMENT;
}

/**
 * Check if a plan has access to auto-comments.
 */
export function planHasAutoComments(plan: string | null | undefined): boolean {
  const s = (plan ?? "").trim().toLowerCase();
  return s.includes("pro") || s.includes("elite") || s.includes("beta") || s.includes("essential");
}

/**
 * Get the user's plan from the profiles table.
 */
export async function getUserPlan(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return "free";
  return (data.plan as string) ?? "free";
}

/**
 * Check daily comment count for anti-spam.
 */
export async function getDailyCommentCount(
  userId: string,
  platform: string,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("auto_comment_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("platform", platform)
    .gte("created_at", today.toISOString());

  if (error) return 0;
  return count ?? 0;
}
