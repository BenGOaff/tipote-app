// lib/planLimits.ts
// Central source of truth for plan-based feature limits.
// Must stay aligned with the public pricing grid.

export type PlanId = "free" | "basic" | "pro" | "elite" | "beta";

export interface PlanLimits {
  /** Monthly AI credits (free = one-shot, others = reset monthly) */
  monthlyCredits: number;
  /** Max social network connections (Infinity = unlimited) */
  maxSocialConnections: number;
  /** Can use AI coach (unlimited) */
  coach: boolean;
  /** Can manage multiple projects/profiles */
  multiprofiles: boolean;
  /** Can access AI-powered statistics analysis */
  analyseStatistiques: boolean;
  /** Can enrich persona via AI */
  enrichissementPersona: boolean;
  /** Can run competitor analysis */
  analyseConcurrence: boolean;
  /** Can purchase additional AI credits */
  achatCredits: boolean;
}

const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    monthlyCredits: 25,
    maxSocialConnections: 1,
    coach: false,
    multiprofiles: false,
    analyseStatistiques: false,
    enrichissementPersona: false,
    analyseConcurrence: false,
    achatCredits: false,
  },
  basic: {
    monthlyCredits: 40,
    maxSocialConnections: 2,
    coach: false,
    multiprofiles: false,
    analyseStatistiques: true,
    enrichissementPersona: true,
    analyseConcurrence: true,
    achatCredits: true,
  },
  pro: {
    monthlyCredits: 150,
    maxSocialConnections: 4,
    coach: true,
    multiprofiles: false,
    analyseStatistiques: true,
    enrichissementPersona: true,
    analyseConcurrence: true,
    achatCredits: true,
  },
  elite: {
    monthlyCredits: 500,
    maxSocialConnections: Infinity,
    coach: true,
    multiprofiles: true,
    analyseStatistiques: true,
    enrichissementPersona: true,
    analyseConcurrence: true,
    achatCredits: true,
  },
  // Beta = lifetime access, same features as Pro
  beta: {
    monthlyCredits: 150,
    maxSocialConnections: 4,
    coach: true,
    multiprofiles: false,
    analyseStatistiques: true,
    enrichissementPersona: true,
    analyseConcurrence: true,
    achatCredits: true,
  },
};

/** Normalize raw plan string to a valid PlanId (defaults to "free"). */
export function normalizePlanId(raw: string | null | undefined): PlanId {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "basic" || s === "pro" || s === "elite" || s === "beta") return s;
  return "free";
}

/** Get plan limits for a given plan string. */
export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlanId(plan)];
}

/**
 * Check if a user can connect a new social platform.
 * Returns { allowed: true } if OK, or { allowed: false, max } if limit reached.
 * Reconnecting an already-connected platform is always allowed (it's an update).
 */
export async function checkSocialConnectionLimit(
  supabase: { from: (t: string) => any },
  userId: string,
  platform: string,
  projectId: string | null,
  plan: string | null | undefined,
): Promise<{ allowed: true } | { allowed: false; max: number }> {
  const limits = getPlanLimits(plan);
  if (limits.maxSocialConnections === Infinity) return { allowed: true };

  // Check if this platform is already connected (reconnect = always OK)
  let existingQuery = supabase
    .from("social_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", platform);
  if (projectId) existingQuery = existingQuery.eq("project_id", projectId);
  const { data: existing } = await existingQuery.limit(1);
  if (existing && existing.length > 0) return { allowed: true };

  // Count distinct connected platforms
  let countQuery = supabase
    .from("social_connections")
    .select("platform")
    .eq("user_id", userId);
  if (projectId) countQuery = countQuery.eq("project_id", projectId);
  const { data: rows } = await countQuery;
  const distinctPlatforms = new Set((rows ?? []).map((r: any) => r.platform)).size;

  if (distinctPlatforms >= limits.maxSocialConnections) {
    return { allowed: false, max: limits.maxSocialConnections };
  }
  return { allowed: true };
}
