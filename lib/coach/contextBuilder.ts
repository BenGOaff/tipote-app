// lib/coach/contextBuilder.ts
//
// Construit le payload contextuel passé à Claude pour générer le brief
// hebdo (phase 4 ROADMAP_RETENTION.md). Lit la source historique réelle
// (countOutcomes) + business_events sur les 7 derniers jours + profile
// business + milestones récents.
//
// Sortie = un string formatté lisible-par-Claude (Markdown léger).
// Pas un JSON — le system prompt est explicite sur le format attendu
// et Claude parse mieux du texte structuré que du JSON brut sur ce
// type de contexte business.
//
// IMPORTANT : on lit la VRAIE historique via countOutcomes (cf. PITFALLS
// section AS ter — JAMAIS compter depuis business_events seul, sinon
// un user avec 500 leads voit "0 leads totaux" dans son brief).

import { countOutcomes, sumSalesForUser } from "@/lib/businessOutcomes";
import { countUserEvents } from "@/lib/businessEvents";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface CoachContextInput {
  userId: string;
  projectId: string | null;
  now?: Date;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface RawBusinessProfile {
  niche?: string | null;
  audience_target?: string | null;
  brand_mission?: string | null;
  revenue_goal_monthly?: number | null;
  content_locale?: string | null;
  first_name?: string | null;
}

interface RawMilestone {
  milestone_key: string;
  unlocked_at: string;
  payload: { emoji?: string; title?: string; backfilled?: boolean } | null;
}

export async function buildCoachContext(input: CoachContextInput): Promise<{
  contextText: string;
  meta: {
    firstName: string;
    locale: string;
    hasData: boolean;
  };
}> {
  const { userId, projectId } = input;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [profile, totals, weekStats, monthStats, milestones, socialAlerts] =
    await Promise.all([
      fetchBusinessProfile(userId, projectId),
      fetchTotals(userId, projectId),
      fetchWeekStats(userId, projectId, since),
      fetchMonthStats(userId, projectId, now),
      fetchRecentMilestones(userId, projectId, since),
      fetchSocialAlerts(userId, projectId, since),
    ]);

  const firstName = (profile?.first_name as string | null) ?? "";
  const locale = (profile?.content_locale as string | null) ?? "fr";

  const hasData =
    totals.leadsTotal > 0 ||
    totals.salesTotal > 0 ||
    totals.postsTotal > 0 ||
    weekStats.totalEvents > 0 ||
    milestones.length > 0;

  const lines: string[] = [];

  // ── Profil business ──
  lines.push("## Profil du créateur");
  if (firstName) lines.push(`- Prénom : ${firstName}`);
  if (profile?.niche) lines.push(`- Niche : ${profile.niche}`);
  if (profile?.audience_target)
    lines.push(`- Audience cible : ${profile.audience_target}`);
  if (profile?.brand_mission) lines.push(`- Mission : ${profile.brand_mission}`);
  if (profile?.revenue_goal_monthly && profile.revenue_goal_monthly > 0) {
    lines.push(
      `- Objectif CA mensuel : ${profile.revenue_goal_monthly} EUR`,
    );
  }

  // ── Stats globales (totaux historiques) ──
  lines.push("");
  lines.push("## Totaux historiques (vraie source)");
  lines.push(`- Leads captés (tous quiz confondus) : ${totals.leadsTotal}`);
  lines.push(
    `- Ventes synchronisées : ${totals.salesTotal} (CA cumulé brut : ${formatEur(totals.salesAmountCents)})`,
  );
  lines.push(`- Posts publiés (tous réseaux) : ${totals.postsTotal}`);
  lines.push(`- Quiz publiés actifs : ${totals.quizPublishedTotal}`);
  lines.push(`- Complétions de quiz cumulées : ${totals.quizCompletesTotal}`);

  // ── Semaine écoulée ──
  lines.push("");
  lines.push("## Semaine écoulée (7 derniers jours)");
  if (weekStats.totalEvents === 0) {
    lines.push("- Aucun événement business tracké cette semaine.");
  } else {
    if (weekStats.leadsCaptured > 0)
      lines.push(`- ${weekStats.leadsCaptured} leads captés`);
    if (weekStats.postsPublished > 0)
      lines.push(`- ${weekStats.postsPublished} posts publiés`);
    if (weekStats.quizCompletes > 0)
      lines.push(`- ${weekStats.quizCompletes} complétions de quiz`);
    if (weekStats.quizShares > 0)
      lines.push(`- ${weekStats.quizShares} partages de quiz`);
    if (weekStats.salesCount > 0) {
      lines.push(
        `- ${weekStats.salesCount} ventes (CA semaine brut : ${formatEur(weekStats.salesAmountCents)})`,
      );
    }
  }

  // ── Mois en cours vs objectif ──
  if (
    profile?.revenue_goal_monthly &&
    profile.revenue_goal_monthly > 0 &&
    monthStats
  ) {
    lines.push("");
    lines.push("## Mois en cours vs objectif");
    const progressPct = Math.round(
      (monthStats.amountCents / 100 / profile.revenue_goal_monthly) * 100,
    );
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      0,
    ).getUTCDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    lines.push(
      `- CA mois en cours : ${formatEur(monthStats.amountCents)} sur objectif ${profile.revenue_goal_monthly} EUR (${progressPct}%)`,
    );
    lines.push(
      `- Jour ${dayOfMonth} du mois, ${daysRemaining} jours restants`,
    );
    if (progressPct < 50 && daysRemaining <= 10) {
      lines.push(
        `- ⚠️ Signal : moins de 10 jours restants et l'objectif n'est qu'à ${progressPct}%`,
      );
    }
  }

  // ── Milestones récents ──
  if (milestones.length > 0) {
    lines.push("");
    lines.push("## Milestones débloqués cette semaine");
    for (const m of milestones) {
      const emoji = m.payload?.emoji ?? "🎉";
      const title = m.payload?.title ?? m.milestone_key;
      lines.push(`- ${emoji} ${title}`);
    }
  }

  // ── Alertes sociales ──
  if (socialAlerts.length > 0) {
    lines.push("");
    lines.push("## Alertes intégrations (7 derniers jours)");
    for (const a of socialAlerts) {
      lines.push(`- ${a}`);
    }
  }

  return {
    contextText: lines.join("\n"),
    meta: { firstName, locale, hasData },
  };
}

async function fetchBusinessProfile(
  userId: string,
  projectId: string | null,
): Promise<RawBusinessProfile | null> {
  let query = supabaseAdmin
    .from("business_profiles")
    .select(
      "niche, audience_target, brand_mission, revenue_goal_monthly, content_locale, first_name",
    )
    .eq("user_id", userId);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[coach/contextBuilder] business_profiles read failed", error.message);
    return null;
  }
  return data as RawBusinessProfile | null;
}

interface Totals {
  leadsTotal: number;
  salesTotal: number;
  salesAmountCents: number;
  postsTotal: number;
  quizPublishedTotal: number;
  quizCompletesTotal: number;
}

async function fetchTotals(
  userId: string,
  projectId: string | null,
): Promise<Totals> {
  const [leadsTotal, postsTotal, quizPublishedTotal, quizCompletesTotal, sales] =
    await Promise.all([
      countOutcomes(userId, "lead_captured", { projectId }),
      countOutcomes(userId, "post_published", { projectId }),
      countOutcomes(userId, "quiz_published", { projectId }),
      countOutcomes(userId, "quiz_complete", { projectId }),
      sumSalesForUser(userId, { projectId }),
    ]);
  return {
    leadsTotal,
    salesTotal: sales.count,
    salesAmountCents: sales.amountCents,
    postsTotal,
    quizPublishedTotal,
    quizCompletesTotal,
  };
}

interface WeekStats {
  totalEvents: number;
  leadsCaptured: number;
  postsPublished: number;
  quizCompletes: number;
  quizShares: number;
  salesCount: number;
  salesAmountCents: number;
}

async function fetchWeekStats(
  userId: string,
  projectId: string | null,
  since: Date,
): Promise<WeekStats> {
  const opts = { since, projectId };
  const [
    leadsCaptured,
    postsPublished,
    quizCompletes,
    quizShares,
    salesCount,
  ] = await Promise.all([
    countUserEvents(userId, "lead_captured", opts),
    countUserEvents(userId, "post_published", opts),
    countUserEvents(userId, "quiz_complete", opts),
    countUserEvents(userId, "quiz_share", opts),
    countUserEvents(userId, "sale", opts),
  ]);

  // Pour le CA semaine, on lit aussi les transactions paid_at dans la
  // fenêtre — c'est la source historique. Optimisation : skip si
  // salesCount=0.
  let salesAmountCents = 0;
  if (salesCount > 0) {
    let q = supabaseAdmin
      .from("transactions")
      .select("amount_cents, refunded_cents")
      .eq("user_id", userId)
      .in("status", ["paid", "partial_refund"])
      .gte("paid_at", since.toISOString());
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    salesAmountCents = ((data ?? []) as Array<{ amount_cents: number | null; refunded_cents: number | null }>).reduce(
      (sum, r) => sum + ((r.amount_cents ?? 0) - (r.refunded_cents ?? 0)),
      0,
    );
  }

  return {
    totalEvents:
      leadsCaptured + postsPublished + quizCompletes + quizShares + salesCount,
    leadsCaptured,
    postsPublished,
    quizCompletes,
    quizShares,
    salesCount,
    salesAmountCents,
  };
}

async function fetchMonthStats(
  userId: string,
  projectId: string | null,
  now: Date,
): Promise<{ amountCents: number } | null> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let q = supabaseAdmin
    .from("transactions")
    .select("amount_cents, refunded_cents")
    .eq("user_id", userId)
    .in("status", ["paid", "partial_refund"])
    .gte("paid_at", monthStart.toISOString());
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) {
    return null;
  }
  const amountCents = ((data ?? []) as Array<{ amount_cents: number | null; refunded_cents: number | null }>).reduce(
    (sum, r) => sum + ((r.amount_cents ?? 0) - (r.refunded_cents ?? 0)),
    0,
  );
  return { amountCents };
}

async function fetchRecentMilestones(
  userId: string,
  projectId: string | null,
  since: Date,
): Promise<RawMilestone[]> {
  let q = supabaseAdmin
    .from("user_milestones")
    .select("milestone_key, unlocked_at, payload")
    .eq("user_id", userId)
    .gte("unlocked_at", since.toISOString())
    .order("unlocked_at", { ascending: false })
    .limit(10);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as RawMilestone[]).filter(
    (m) => !m.payload?.backfilled,
  );
}

async function fetchSocialAlerts(
  userId: string,
  projectId: string | null,
  since: Date,
): Promise<string[]> {
  // Lit business_events kind=account_disconnected ou post_failed
  // dans la semaine. Permissif : si la table n'a pas encore ces
  // events branchés, retourne vide silencieusement.
  let q = supabaseAdmin
    .from("business_events")
    .select("kind, source, payload, occurred_at")
    .eq("user_id", userId)
    .in("kind", ["account_disconnected", "post_failed"])
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(5);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as Array<{ kind: string; source: string; payload: Record<string, unknown> | null; occurred_at: string }>).map(
    (e) => {
      if (e.kind === "account_disconnected") {
        return `Compte ${e.source} déconnecté le ${e.occurred_at.slice(0, 10)}`;
      }
      return `Échec de publication sur ${e.source} le ${e.occurred_at.slice(0, 10)}`;
    },
  );
}

const EUR_FMT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatEur(cents: number): string {
  return EUR_FMT.format(Math.round(cents / 100));
}
