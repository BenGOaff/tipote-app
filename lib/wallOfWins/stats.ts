// lib/wallOfWins/stats.ts
//
// Agrégateur unique pour le Wall of Wins (phase 2 ROADMAP_RETENTION.md).
// Lit business_events sur une fenêtre temporelle pour reconstituer ce
// que le user a obtenu pendant la période, avec comparaison vs la
// période précédente de même durée.
//
// RÈGLE CARDINALE (Béné, 1er juin 2026) : si tous les compteurs sont
// à 0, on retourne `hasResults = false` → le composant client REND
// NULL (carte invisible). Un dashboard "0 partout" démotive et
// augmente le churn — c'est l'inverse de l'effet recherché.
//
// Méthodologie temps : la fenêtre est calculée côté serveur ou côté
// client (selon caller). Pour le V1, on accepte des Date passées
// directement. Bucketing local jour vs UTC à la charge du caller via
// lib/dateKeys.ts si besoin (cf. PITFALLS section V).

import {
  countUserEvents,
  sumEventAmountsInRange,
  type BusinessEventKind,
} from "@/lib/businessEvents";
import { stripHtml } from "@/lib/richText";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface WallOfWinsStats {
  // Compteurs principaux (fenêtre courante)
  leadsCaptured: number;
  postsPublished: number;
  quizCompletes: number;
  quizShares: number;
  salesCount: number;
  salesAmountCents: number;

  // Estimation temps économisé en minutes (12 min/post + 30 min/quiz
  // complete saisi-manuel-équivalent + 5 min/lead à tagger
  // manuellement dans SIO). Conservatif.
  hoursSavedEstimate: number;

  // Top quiz par nombre de complétions sur la fenêtre. Null si aucun.
  topQuiz: { id: string; title: string; completes: number } | null;

  // Milestones débloqués sur la fenêtre. Triés par unlocked_at DESC.
  milestonesUnlocked: Array<{
    key: string;
    emoji: string;
    title: string;
    unlockedAt: string;
  }>;
}

export interface WallOfWinsPayload {
  /** True si AU MOINS UN compteur > 0 (sinon la carte est masquée). */
  hasResults: boolean;
  /** Fenêtre courante (since inclusive, until exclusive). */
  current: WallOfWinsStats;
  /** Période précédente de MÊME DURÉE (since' = since - durée, until' = since). */
  previous: WallOfWinsStats;
  /** Borne de la fenêtre, retournée pour debug client. */
  range: { since: string; until: string };
}

export interface GetWallOfWinsArgs {
  userId: string;
  projectId?: string | null;
  since: Date;
  until: Date;
}

/**
 * Construit le payload Wall of Wins pour un user + projet + fenêtre.
 * Lit business_events (les events post 4 juin 2026). Pour la fenêtre
 * "all time" (since très ancien), business_events ne contient PAS
 * l'historique pré-4-juin — mais c'est ok pour le Wall of Wins qui
 * affiche "ce qui se passe MAINTENANT" pas le total absolu (le total
 * absolu est dans /analytics ou /compta).
 */
export async function getWallOfWinsPayload(
  args: GetWallOfWinsArgs,
): Promise<WallOfWinsPayload> {
  const { userId, projectId, since, until } = args;
  const durationMs = until.getTime() - since.getTime();
  const previousUntil = since;
  const previousSince = new Date(since.getTime() - durationMs);

  const [current, previous] = await Promise.all([
    computeStatsForRange(userId, projectId ?? null, since, until),
    computeStatsForRange(userId, projectId ?? null, previousSince, previousUntil),
  ]);

  const hasResults =
    current.leadsCaptured > 0 ||
    current.postsPublished > 0 ||
    current.quizCompletes > 0 ||
    current.quizShares > 0 ||
    current.salesCount > 0 ||
    current.milestonesUnlocked.length > 0;

  return {
    hasResults,
    current,
    previous,
    range: { since: since.toISOString(), until: until.toISOString() },
  };
}

async function computeStatsForRange(
  userId: string,
  projectId: string | null,
  since: Date,
  until: Date,
): Promise<WallOfWinsStats> {
  const baseOpts = { since, until, projectId };

  const [
    leadsCaptured,
    postsPublished,
    quizCompletes,
    quizShares,
    salesCount,
    salesAmountCents,
    topQuiz,
    milestonesUnlocked,
  ] = await Promise.all([
    countUserEvents(userId, "lead_captured", baseOpts),
    countUserEvents(userId, "post_published", baseOpts),
    countUserEvents(userId, "quiz_complete", baseOpts),
    countUserEvents(userId, "quiz_share", baseOpts),
    countUserEvents(userId, "sale", baseOpts),
    sumEventAmountsInRange(userId, "sale", baseOpts),
    fetchTopQuizInRange(userId, projectId, since, until),
    fetchMilestonesUnlockedInRange(userId, projectId, since, until),
  ]);

  // Estimation temps économisé (conservateur) :
  //   - 12 min par post publié (rédaction + adaptation + planification)
  //   -  5 min par lead capturé (tag manuel SIO équivalent)
  //   - 30 min par quiz complete (équivalent de l'analyse manuelle
  //     d'un visiteur qualifié — sous-estimé volontairement)
  const minutesSaved =
    postsPublished * 12 + leadsCaptured * 5 + quizCompletes * 30;
  const hoursSavedEstimate = Math.round((minutesSaved / 60) * 10) / 10;

  return {
    leadsCaptured,
    postsPublished,
    quizCompletes,
    quizShares,
    salesCount,
    salesAmountCents,
    hoursSavedEstimate,
    topQuiz,
    milestonesUnlocked,
  };
}

/**
 * Top quiz par complétions sur la fenêtre. Stratégie : lit les events
 * `quiz_complete` du user dans la fenêtre, groupe par `payload.quizId`
 * en mémoire, retourne le quiz avec le plus de complétions + son titre
 * via 1 fetch.
 *
 * Cap interne 5000 events pour éviter un OOM en cas de méga-tunnel. Au
 * besoin on basculera sur une RPC SQL d'agrégation côté DB.
 */
async function fetchTopQuizInRange(
  userId: string,
  projectId: string | null,
  since: Date,
  until: Date,
): Promise<WallOfWinsStats["topQuiz"]> {
  let q = supabaseAdmin
    .from("business_events")
    .select("payload")
    .eq("user_id", userId)
    .eq("kind", "quiz_complete")
    .gte("occurred_at", since.toISOString())
    .lt("occurred_at", until.toISOString())
    .limit(5000);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) {
    console.error("[wallOfWins] fetchTopQuizInRange failed", error.message);
    return null;
  }

  const rows = (data ?? []) as Array<{ payload: Record<string, unknown> | null }>;
  const counts = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const row of rows) {
    const quizId = (row.payload?.quizId as string | undefined) ?? null;
    if (!quizId) continue;
    counts.set(quizId, (counts.get(quizId) ?? 0) + 1);
    const title = row.payload?.quizTitle as string | undefined;
    if (title && !titles.has(quizId)) titles.set(quizId, title);
  }
  if (counts.size === 0) return null;

  let topId = "";
  let topCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  }
  if (!topId) return null;

  let title = titles.get(topId) ?? "";
  if (!title) {
    const { data: quizRow } = await supabaseAdmin
      .from("quizzes")
      .select("title")
      .eq("id", topId)
      .maybeSingle();
    title = (quizRow?.title as string | undefined) ?? "Quiz sans titre";
  }
  // Strip HTML cote serveur (mirror Tiquiz, Adeline 4 juin 2026) :
  // les titres quiz sont du rich-text editor, on retourne du texte plat
  // pour eviter la fuite HTML dans le payload Wall of Wins.
  return { id: topId, title: stripHtml(title) || title, completes: topCount };
}

async function fetchMilestonesUnlockedInRange(
  userId: string,
  projectId: string | null,
  since: Date,
  until: Date,
): Promise<WallOfWinsStats["milestonesUnlocked"]> {
  let q = supabaseAdmin
    .from("user_milestones")
    .select("milestone_key, payload, unlocked_at")
    .eq("user_id", userId)
    .gte("unlocked_at", since.toISOString())
    .lt("unlocked_at", until.toISOString())
    .order("unlocked_at", { ascending: false })
    .limit(20);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) {
    console.error("[wallOfWins] fetchMilestonesUnlockedInRange failed", error.message);
    return [];
  }
  return ((data ?? []) as Array<{
    milestone_key: string;
    payload: { emoji?: string; title?: string } | null;
    unlocked_at: string;
  }>)
    .filter((row) => {
      // Skip les backfills silencieux : ils ont seen_at = unlocked_at
      // = now() au moment du run cron, donc tomberaient ici si la
      // fenêtre couvre ce moment. payload.backfilled = true permet
      // de les distinguer des vrais milestones débloqués en live.
      return !(row.payload && (row.payload as Record<string, unknown>).backfilled);
    })
    .map((row) => ({
      key: row.milestone_key,
      emoji: row.payload?.emoji ?? "🎉",
      title: row.payload?.title ?? row.milestone_key,
      unlockedAt: row.unlocked_at,
    }));
}

// ---------------------------------------------------------------------------
// Helpers de fenêtre temporelle (period preset)
// ---------------------------------------------------------------------------

export type WallOfWinsPeriod = "month" | "30d" | "90d";

/**
 * Construit la fenêtre courante pour un preset. "month" = mois calendaire
 * courant en UTC (V1 simple — bucketing strict local jour à voir en V2
 * si Béné juge nécessaire ; cf. PITFALLS section V).
 *
 * @returns { since: Date, until: Date } avec since inclusive, until exclusive.
 */
export function resolveWindowForPeriod(period: WallOfWinsPeriod, now: Date = new Date()): {
  since: Date;
  until: Date;
} {
  const until = new Date(now.getTime());
  if (period === "month") {
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { since, until };
  }
  if (period === "30d") {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { since, until };
  }
  // 90d
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { since, until };
}
