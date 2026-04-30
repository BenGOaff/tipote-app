// lib/leadLock.ts
// Free-tier lead lock: oldest 10 leads inside any rolling 30-day window are visible,
// the rest are returned with masked PII so blurring in the UI is purely decorative
// (no plain-text leak via DevTools / Network tab).

import { isPaidPlan, FREE_LIMITS } from "./planLimits";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MASK = "••••••";
const MASK_EMAIL = "•••@•••.•••";

export type LeadLike = {
  id: string;
  created_at: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  country?: string | null;
  answers?: unknown;
  quiz_answers?: unknown;
  result_id?: string | null;
  quiz_result_title?: string | null;
  [key: string]: unknown;
};

/**
 * Returns the set of lead IDs that should be locked for this plan. Useful when
 * the caller only has a paginated SLICE of leads and needs to compute lock
 * against the FULL timeline (the rolling-window rule is global, not per-page).
 *
 * Pass `[]` for paid plans — function short-circuits and returns an empty set.
 */
export function computeLockedLeadIds(
  timeline: { id: string; created_at: string }[],
  plan: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (isPaidPlan(plan)) return out;
  const ascending = [...timeline].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const windowMs: number[] = [];
  let head = 0;
  for (const lead of ascending) {
    const t = new Date(lead.created_at).getTime();
    while (head < windowMs.length && windowMs[head] < t - THIRTY_DAYS_MS) head++;
    windowMs.push(t);
    const inWindow = windowMs.length - head;
    if (inWindow > FREE_LIMITS.visibleLeadsPerMonth) out.add(lead.id);
  }
  return out;
}

/**
 * Adds `locked: boolean` to each lead. "Oldest first inside the rolling 30d window"
 * means: once free creators hit 10 leads in any 30-day stretch, every new lead is
 * locked — so the upsell pressure stays on, but historic leads they could already
 * see don't suddenly disappear when the window slides forward.
 *
 * Returns leads in the SAME order they came in.
 */
export function applyLeadLock<T extends LeadLike>(
  leads: T[],
  plan: string | null | undefined,
): (T & { locked: boolean })[] {
  const lockedIds = computeLockedLeadIds(
    leads.map((l) => ({ id: l.id, created_at: l.created_at })),
    plan,
  );
  return leads.map((l) => ({ ...l, locked: lockedIds.has(l.id) }));
}

/** Replace PII on locked leads with visible-but-meaningless masks. Idempotent. */
export function redactLockedLead<T extends LeadLike & { locked: boolean }>(lead: T): T {
  if (!lead.locked) return lead;
  return {
    ...lead,
    email: MASK_EMAIL,
    first_name: MASK,
    last_name: MASK,
    phone: MASK,
    country: MASK,
    answers: null,
    quiz_answers: null,
    result_id: null,
    quiz_result_title: MASK,
  };
}

/** One-shot helper: applies lock then redacts in a single pass. */
export function lockAndRedact<T extends LeadLike>(
  leads: T[],
  plan: string | null | undefined,
): (T & { locked: boolean })[] {
  return applyLeadLock(leads, plan).map(redactLockedLead);
}
