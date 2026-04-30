// lib/aiRateLimit.ts
// Per-user in-memory rate limiter for AI-cost-bearing endpoints
// (rewrite, rebalance). The goal isn't absolute fairness — Vercel runs
// multiple instances and each one keeps its own Map — it's a soft cap
// that prevents a single authenticated user from accidentally (or
// intentionally) burning Anthropic credits in a tight loop.
//
// We track (count, resetAt) per (key + bucket). When a request arrives
// after resetAt, the window rolls over.
//
// Persistent abuse should still be caught by Anthropic's account-level
// quota and by alerting on /v1/messages spend in dashboards.

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export type RateLimitVerdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; limit: number };

export interface RateLimitOptions {
  /** Stable key — typically `bucketName:userId`. */
  key: string;
  /** Max calls per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Counts the current call. Returns ok=true (decrementing remaining) until
 * the window cap is hit; after that, ok=false until the window rolls over.
 *
 * IMPORTANT: this is per-instance. Don't rely on it for hard accounting —
 * use it as a guardrail, not a billing meter.
 */
export function checkRateLimit(opts: RateLimitOptions): RateLimitVerdict {
  const now = Date.now();
  const existing = buckets.get(opts.key);

  if (!existing || existing.resetAt <= now) {
    // Fresh window
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    // Light-touch GC: clear roughly half the stale buckets every ~256
    // calls so the Map doesn't grow unbounded across long-lived
    // instances. We don't iterate the whole Map every time — that's
    // O(n) per request which would dominate the cheap path.
    if (buckets.size > 1024 && Math.random() < 0.01) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    return { ok: true, remaining: opts.limit - 1 };
  }

  if (existing.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      limit: opts.limit,
    };
  }

  existing.count += 1;
  return { ok: true, remaining: opts.limit - existing.count };
}
