// lib/businessEvents.ts
//
// Helper unique d'INSERT dans `business_events` (cf. ROADMAP_RETENTION.md
// phase 0 + CLAUDE_PITFALLS.md section AS).
//
// Pourquoi un helper unique :
//   - INSERT direct via service-role (les users n'ont pas de policy
//     INSERT). Garantit qu'un user ne peut pas forger un `sale` event
//     pour se gonfler des milestones.
//   - PAS de RPC : les RPC `await rpc(...)` qui ne lisent pas `{ error }`
//     masquent les échecs (cf. pitfalls section F, vu sur les compteurs
//     quiz Tiquiz).
//   - Dedupe centralisé : tous les appelants passent par la même clé
//     UNIQUE partielle (user_id, dedupe_key) → idempotence des syncs
//     externes (Stripe, PayPal, Mollie, Systeme.io, leads quiz, etc.).
//
// Consommé par : Wall of Wins (phase 2), milestones engine (phase 1),
// détecteur d'inactivité réengagement (phase 3), brief coach IA (phase 4).

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BusinessEventKind =
  | "sale"
  | "refund"
  | "lead_captured"
  | "post_published"
  | "post_failed"
  | "quiz_view"
  | "quiz_start"
  | "quiz_complete"
  | "quiz_share"
  | "quiz_published"
  | "popquiz_published"
  | "page_published"
  | "account_connected"
  | "account_disconnected"
  | "strategy_recalculated"
  | "strategy_drift"
  | "milestone_unlocked";

export type BusinessEventSource =
  | "internal"
  | "stripe"
  | "paypal"
  | "mollie"
  | "systemeio"
  | "manual"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "threads"
  | "twitter"
  | "x"
  | "tiktok"
  | "pinterest";

export interface LogBusinessEventInput {
  userId: string;
  projectId?: string | null;
  kind: BusinessEventKind;
  payload?: Record<string, unknown>;
  amountCents?: number | null;
  currency?: string | null;
  source?: BusinessEventSource;
  occurredAt?: string | Date | null;
  dedupeKey?: string | null;
}

export interface LogBusinessEventResult {
  ok: boolean;
  eventId?: number;
  reason?: "inserted" | "dedupe_skip" | "missing_user" | "db_error";
  error?: string;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * INSERT direct dans `business_events`.
 *
 * - Si `dedupeKey` est passé et qu'un event existe déjà avec
 *   (user_id, dedupe_key), on renvoie `{ok: true, reason: "dedupe_skip"}`
 *   (comportement idempotent attendu par les syncs externes).
 * - Toute autre erreur DB renvoie `{ok: false, reason: "db_error", error}`.
 *   Les call-sites loggent mais ne throw pas (pattern fire-and-forget
 *   compatible avec les hot paths publics — cf. PITFALLS section D :
 *   les endpoints publics ne doivent JAMAIS renvoyer 4xx pour des
 *   raisons d'analytics).
 */
export async function logBusinessEvent(
  input: LogBusinessEventInput,
  client: SupabaseClient = supabaseAdmin,
): Promise<LogBusinessEventResult> {
  if (!input.userId) {
    return { ok: false, reason: "missing_user" };
  }

  const occurredAtIso =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : (input.occurredAt ?? null);

  const row = {
    user_id: input.userId,
    project_id: input.projectId ?? null,
    kind: input.kind,
    payload: input.payload ?? {},
    amount_cents: input.amountCents ?? null,
    currency: input.currency ?? null,
    source: input.source ?? "internal",
    dedupe_key: input.dedupeKey ?? null,
    occurred_at: occurredAtIso ?? new Date().toISOString(),
  };

  const { data, error } = await client
    .from("business_events")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: true, reason: "dedupe_skip" };
    }
    console.error("[businessEvents] insert failed", {
      kind: input.kind,
      source: input.source,
      dedupeKey: input.dedupeKey,
      error: error.message,
    });
    return { ok: false, reason: "db_error", error: error.message };
  }

  return { ok: true, eventId: data?.id, reason: "inserted" };
}

// ----------------------------------------------------------------------------
// Lecture / agrégation
// ----------------------------------------------------------------------------

export interface BusinessEventRow {
  id: number;
  user_id: string;
  project_id: string | null;
  kind: BusinessEventKind;
  payload: Record<string, unknown>;
  amount_cents: number | null;
  currency: string | null;
  source: BusinessEventSource;
  dedupe_key: string | null;
  occurred_at: string;
  created_at: string;
}

export interface GetEventsOptions {
  kinds?: BusinessEventKind[];
  projectId?: string | null;
  limit?: number;
  client?: SupabaseClient;
}

/**
 * Sélection des events d'un user sur une fenêtre temporelle.
 * Utilisé par les agrégats Wall of Wins (phase 2), le détecteur
 * d'inactivité réengagement (phase 3), le brief coach (phase 4).
 *
 * Bucketing temporel = à faire côté appelant via `lib/dateKeys.ts`
 * (cf. PITFALLS section V — toujours jour LOCAL du créateur, jamais UTC).
 */
export async function getUserEventsSince(
  userId: string,
  since: Date,
  opts: GetEventsOptions = {},
): Promise<BusinessEventRow[]> {
  if (!userId) return [];

  const client = opts.client ?? supabaseAdmin;
  let query = client
    .from("business_events")
    .select(
      "id,user_id,project_id,kind,payload,amount_cents,currency,source,dedupe_key,occurred_at,created_at",
    )
    .eq("user_id", userId)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false });

  if (opts.kinds && opts.kinds.length > 0) {
    query = query.in("kind", opts.kinds);
  }
  if (opts.projectId) {
    query = query.eq("project_id", opts.projectId);
  }
  if (opts.limit && opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[businessEvents] getUserEventsSince failed", error.message);
    return [];
  }
  return (data ?? []) as BusinessEventRow[];
}

/**
 * Compte les events d'un user par kind sur une fenêtre. Utilisé par
 * l'engine de milestones (phase 1) pour évaluer les seuils (10e lead,
 * 100e vue, etc.) sans trier 100k rows.
 */
export async function countUserEvents(
  userId: string,
  kind: BusinessEventKind,
  opts: { since?: Date; projectId?: string | null; client?: SupabaseClient } = {},
): Promise<number> {
  if (!userId) return 0;
  const client = opts.client ?? supabaseAdmin;
  let query = client
    .from("business_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind);

  if (opts.since) {
    query = query.gte("occurred_at", opts.since.toISOString());
  }
  if (opts.projectId) {
    query = query.eq("project_id", opts.projectId);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[businessEvents] countUserEvents failed", error.message);
    return 0;
  }
  return count ?? 0;
}

// ----------------------------------------------------------------------------
// Helpers de construction de dedupe keys (centralisé pour cohérence)
// ----------------------------------------------------------------------------

/**
 * Hash léger non-crypto pour les dedupe keys qui doivent éviter de fuiter
 * une PII (email). Pas de sécurité — juste une normalisation déterministe.
 */
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    h = (h * 31 + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export const dedupeKeys = {
  quizLead: (quizId: string, email: string) =>
    `quiz_lead:${quizId}:${hashEmail(email)}`,
  popquizLead: (popquizId: string, email: string) =>
    `popquiz_lead:${popquizId}:${hashEmail(email)}`,
  pageLead: (pageId: string, email: string) =>
    `page_lead:${pageId}:${hashEmail(email)}`,
  externalSale: (source: BusinessEventSource, externalId: string) =>
    `${source}:${externalId}`,
  postPublished: (contentId: string, platform: string) =>
    `post_published:${contentId}:${platform}`,
};
