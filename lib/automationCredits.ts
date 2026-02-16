// lib/automationCredits.ts
// Server-side helpers for automation credits (auto-comments).
// Uses Supabase RPC functions for atomic credit operations.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AutomationCreditsRow = {
  user_id: string;
  credits_total: number;
  credits_used: number;
  created_at: string;
  updated_at: string;
};

export type AutomationCreditsSnapshot = AutomationCreditsRow & {
  credits_remaining: number;
};

/** Credit cost per auto-comment */
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

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeSnapshot(row: AutomationCreditsRow): AutomationCreditsSnapshot {
  const total = toNum(row.credits_total, 0);
  const used = toNum(row.credits_used, 0);
  return {
    ...row,
    credits_total: total,
    credits_used: used,
    credits_remaining: Math.max(0, total - used),
  };
}

/**
 * Calculate total credits needed for a given auto-comment config.
 */
export function calculateCreditsNeeded(nbBefore: number, nbAfter: number): number {
  return (nbBefore + nbAfter) * CREDIT_PER_COMMENT;
}

/**
 * Ensure automation credits row exists for user.
 */
export async function ensureAutomationCredits(userId: string): Promise<AutomationCreditsSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("ensure_automation_credits", {
    p_user_id: userId,
  });

  if (error || !data) {
    throw new Error(error?.message || "Failed to ensure_automation_credits");
  }

  return computeSnapshot(data as AutomationCreditsRow);
}

/**
 * Consume automation credits (atomic, row-locked).
 */
export async function consumeAutomationCredits(
  userId: string,
  amount: number,
  context: Record<string, unknown> = {},
): Promise<AutomationCreditsSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("consume_automation_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_context: context,
  });

  if (error || !data) {
    const msg = error?.message || "Failed to consume_automation_credits";
    if (msg.includes("INSUFFICIENT") || msg.includes("NO_AUTOMATION")) {
      const e = new Error("INSUFFICIENT_AUTOMATION_CREDITS");
      (e as any).code = "INSUFFICIENT_AUTOMATION_CREDITS";
      throw e;
    }
    throw new Error(msg);
  }

  return computeSnapshot(data as AutomationCreditsRow);
}

/**
 * Add automation credits for a user (admin action).
 */
export async function addAutomationCredits(
  userId: string,
  amount: number,
): Promise<AutomationCreditsSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("admin_add_automation_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    throw new Error(error.message || "Failed to add automation credits");
  }

  if (data && typeof data === "object" && "credits_total" in data) {
    return computeSnapshot(data as AutomationCreditsRow);
  }

  return ensureAutomationCredits(userId);
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
