// lib/businessOutcomes.ts
//
// Compteurs "vérité historique" pour les milestones rétention.
//
// CONTEXTE CRITIQUE (Béné, 1er juin 2026) :
// Les users Tipote ont DES MOIS d'historique business avant que la
// table `business_events` n'existe (créée 2026-06-04). Faire compter
// les milestones depuis `business_events` ferait apparaître `first_lead`
// chez quelqu'un qui a déjà 500 leads = effet contre-productif, perte
// de confiance, "ton outil débloque trop tard". INACCEPTABLE.
//
// Ce module lit DIRECTEMENT les tables canoniques historiques :
//   - leads      → JOIN quizzes (user_id) → quiz_leads
//   - posts      → content_item.status = 'published'
//   - sales      → transactions.status IN ('paid','partial_refund')
//   - completes  → JOIN quizzes (user_id) → quiz_events (event_type='complete')
//   - quizzes    → quizzes.status = 'active'
//
// Aucun INSERT, aucune ALTER, aucun side-effect : pure lecture.
// L'engine milestones utilise ce module au lieu de `countUserEvents`
// pour avoir le bon chiffre dès le premier event post-déploiement.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import type { BusinessEventKind } from "@/lib/businessEvents";
import { countUserEvents } from "@/lib/businessEvents";

export interface CountOptions {
  projectId?: string | null;
}

export interface OutcomeAmount {
  count: number;
  amountCents: number;
}

/**
 * Compteur principal pour l'engine milestones. Pour chaque `kind` connu,
 * lit la source HISTORIQUE (depuis le jour 1 du user). Pour les kinds
 * "futurs" (account_disconnected, strategy_drift, etc.) qui n'existent
 * que dans business_events, fallback sur countUserEvents.
 */
export async function countOutcomes(
  userId: string,
  kind: BusinessEventKind,
  opts: CountOptions = {},
): Promise<number> {
  switch (kind) {
    case "lead_captured":
      return countLeadsForUser(userId, opts);
    case "post_published":
      return countPublishedPostsForUser(userId, opts);
    case "sale": {
      const result = await countSalesForUser(userId, opts);
      return result.count;
    }
    case "quiz_complete":
      return countQuizEventsForUser(userId, "complete", opts);
    case "quiz_view":
      return countQuizEventsForUser(userId, "view", opts);
    case "quiz_start":
      return countQuizEventsForUser(userId, "start", opts);
    case "quiz_share":
      return countQuizEventsForUser(userId, "share", opts);
    case "quiz_published":
      return countPublishedQuizzesForUser(userId, opts);
    default:
      return countUserEvents(userId, kind, opts);
  }
}

/**
 * Variante de countOutcomes pour les sales : remonte aussi le total
 * encaissé (en centimes, monnaie d'origine non convertie). Utilisé par
 * les milestones de palier CA (first_1k€, sales_first_5k€…) qui
 * nécessitent un cumul, pas juste un compteur.
 */
export async function sumSalesForUser(
  userId: string,
  opts: CountOptions = {},
): Promise<OutcomeAmount> {
  return countSalesForUser(userId, opts);
}

// ---------------------------------------------------------------------------
// Implémentations spécifiques
// ---------------------------------------------------------------------------

/**
 * Compte tous les `quiz_leads` dont le quiz appartient à `userId`.
 * Stratégie 2-requêtes (Supabase JS ne joint pas facilement pour un
 * count) : (1) liste quiz_ids du user, (2) count quiz_leads IN.
 *
 * `project_id` est sur `quizzes`, pas sur `quiz_leads`, donc le filtre
 * project se fait à l'étape (1).
 */
async function countLeadsForUser(
  userId: string,
  opts: CountOptions,
): Promise<number> {
  let quizQ = supabaseAdmin
    .from("quizzes")
    .select("id")
    .eq("user_id", userId);
  if (opts.projectId) quizQ = quizQ.eq("project_id", opts.projectId);
  const { data: quizRows, error: quizErr } = await quizQ;
  if (quizErr) {
    console.error("[outcomes] quizzes select failed", quizErr.message);
    return 0;
  }
  const quizIds = (quizRows ?? []).map((r) => r.id as string);
  if (quizIds.length === 0) return 0;

  // Supabase IN clause performe bien jusqu'à ~1000 ids ; au-delà on
  // chunke. Très rare en pratique pour un solopreneur Tipote.
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < quizIds.length; i += CHUNK) {
    const slice = quizIds.slice(i, i + CHUNK);
    const { count, error } = await supabaseAdmin
      .from("quiz_leads")
      .select("id", { count: "exact", head: true })
      .in("quiz_id", slice);
    if (error) {
      console.error("[outcomes] quiz_leads count failed", error.message);
      return total;
    }
    total += count ?? 0;
  }
  return total;
}

/**
 * Compte les posts publiés via Tipote sur n'importe quel réseau social.
 * Source = `content_item.status = 'published'`. La colonne user_id
 * existe directement (cf. social/publish/route.ts qui met status =
 * 'published' après succès).
 */
async function countPublishedPostsForUser(
  userId: string,
  opts: CountOptions,
): Promise<number> {
  let q = supabaseAdmin
    .from("content_item")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "published");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { count, error } = await q;
  if (error) {
    console.error("[outcomes] content_item count failed", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Compte les ventes business du créateur (pas le CA Tipote de Béné !).
 * Source = `transactions.status IN ('paid', 'partial_refund')`.
 * `transactions` a déjà `user_id` et `project_id` (cf. migration
 * 20260508_compta_payments_tables.sql).
 *
 * Retourne aussi la somme `amount_cents - refunded_cents` pour les
 * milestones de palier CA (first_1k€, first_5k€…). Pas de conversion
 * de devise V1 — on additionne brut (la majorité des users Tipote
 * sont en EUR de toute façon).
 */
async function countSalesForUser(
  userId: string,
  opts: CountOptions,
): Promise<OutcomeAmount> {
  let q = supabaseAdmin
    .from("transactions")
    .select("amount_cents, refunded_cents", { count: "exact" })
    .eq("user_id", userId)
    .in("status", ["paid", "partial_refund"]);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, count, error } = await q;
  if (error) {
    console.error("[outcomes] transactions count failed", error.message);
    return { count: 0, amountCents: 0 };
  }
  const rows = (data ?? []) as Array<{ amount_cents: number | null; refunded_cents: number | null }>;
  const amountCents = rows.reduce(
    (sum, r) => sum + ((r.amount_cents ?? 0) - (r.refunded_cents ?? 0)),
    0,
  );
  return { count: count ?? 0, amountCents };
}

/**
 * Compte les events visiteurs (view / start / complete / share) de
 * type donné, sur tous les quiz du user. Source = `quiz_events` via
 * JOIN par `quiz_id`. Même stratégie 2-requêtes que les leads (Supabase
 * JS ne joint pas pour un count agrégé).
 */
async function countQuizEventsForUser(
  userId: string,
  eventType: "view" | "start" | "complete" | "share",
  opts: CountOptions,
): Promise<number> {
  let quizQ = supabaseAdmin
    .from("quizzes")
    .select("id")
    .eq("user_id", userId);
  if (opts.projectId) quizQ = quizQ.eq("project_id", opts.projectId);
  const { data: quizRows, error: quizErr } = await quizQ;
  if (quizErr) {
    console.error("[outcomes] quizzes select failed", quizErr.message);
    return 0;
  }
  const quizIds = (quizRows ?? []).map((r) => r.id as string);
  if (quizIds.length === 0) return 0;

  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < quizIds.length; i += CHUNK) {
    const slice = quizIds.slice(i, i + CHUNK);
    const { count, error } = await supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", eventType)
      .in("quiz_id", slice);
    if (error) {
      console.error("[outcomes] quiz_events count failed", error.message);
      return total;
    }
    total += count ?? 0;
  }
  return total;
}

/**
 * Compte les quiz publiés ("active" dans Tipote, pas "published" —
 * convention historique, cf. grep `.eq("status", "active")` dans les
 * routes quiz). Pas de filtre mode= : si Béné veut différencier
 * quizzes vs sondages plus tard, on étendra avec un opts.modes filter.
 */
async function countPublishedQuizzesForUser(
  userId: string,
  opts: CountOptions,
): Promise<number> {
  let q = supabaseAdmin
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { count, error } = await q;
  if (error) {
    console.error("[outcomes] quizzes published count failed", error.message);
    return 0;
  }
  return count ?? 0;
}
