// lib/insights.ts
// Rule-based "smart insights" — small, opinionated suggestions derived
// directly from the user's data. NO LLM call: each rule is a tight
// pure function that looks at the snapshot and decides whether to
// surface a card.
//
// Why rules instead of an AI prompt?
//  - Instant (no streaming, no flash of "L'IA réfléchit…").
//  - Free (no token cost on every dashboard load).
//  - Predictable (the same situation always returns the same advice,
//    so we can confidently localise + iterate the copy).
//  - The rules themselves are documented next to the code that
//    triggers them — easier for the next dev to extend than a
//    multi-thousand-token system prompt.
//
// We only emit the 3 most-relevant cards at most so the dashboard
// doesn't become a wall of nudges.

export type InsightInput = {
  /** Active projects (status='active', any mode). */
  activeProjects: Array<{
    id: string;
    title: string;
    starts_count: number;
    leads_count: number;
    shares_count: number;
    /** Days since last activity (created/updated). null if unknown. */
    daysSinceActive: number | null;
    mode: "quiz" | "survey" | null;
  }>;
  /** Total leads captured across all projects. */
  totalLeads: number;
  /** Number of currently-draft projects (not yet published). */
  draftProjectCount: number;
};

export type Insight = {
  /** Stable id — used as react key + i18n hook. */
  id: string;
  /** Headline displayed prominently on the card. */
  title: string;
  /** Plain-language explanation of the "why". */
  body: string;
  /** Action label shown on the CTA button. */
  ctaLabel: string;
  /** Where the CTA points. */
  ctaHref: string;
  /** Tone — drives the icon + accent on the card. */
  tone: "info" | "warning" | "success" | "primary";
  /** Optional: ID of the project the insight is about. */
  targetId?: string;
};

/**
 * Compute the up-to-3 most-relevant insights for the user. Insights
 * are ordered by importance — high-friction "your work is going
 * unnoticed" cards float to the top.
 */
export function computeInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1. A published project that's quiet for 7+ days — usually means
  //    the share momentum died. Top priority because it's the easiest
  //    revenue lift the user can capture.
  for (const p of input.activeProjects) {
    if (
      p.daysSinceActive !== null &&
      p.daysSinceActive >= 7 &&
      p.leads_count > 0 &&
      p.shares_count < 3
    ) {
      out.push({
        id: `quiet-${p.id}`,
        title: `Ton ${p.mode === "survey" ? "sondage" : "quiz"} « ${p.title || "Sans titre"} » s'est endormi`,
        body: `${p.daysSinceActive} jours sans nouvelle réponse. Un repartage relance souvent le flux.`,
        ctaLabel: "Voir le projet",
        ctaHref: `/quiz/${p.id}`,
        tone: "warning",
        targetId: p.id,
      });
      break; // one quiet-project insight at a time
    }
  }

  // 2. High traffic but low capture — the funnel leaks.
  for (const p of input.activeProjects) {
    if (p.starts_count >= 50 && p.leads_count > 0) {
      const rate = p.leads_count / p.starts_count;
      if (rate < 0.1) {
        out.push({
          id: `low-conv-${p.id}`,
          title: `« ${p.title || "Sans titre"} » : ${p.starts_count} démarrages, peu de captures`,
          body: `Taux de capture ${Math.round(rate * 100)} %. Vérifie la pertinence du CTA et la longueur du formulaire.`,
          ctaLabel: "Optimiser",
          ctaHref: `/quiz/${p.id}`,
          tone: "warning",
          targetId: p.id,
        });
        break;
      }
    }
  }

  // 3. Strong performer worth amplifying — high conversion + healthy
  //    starts. Suggest doubling down (paid promo, share campaign).
  for (const p of input.activeProjects) {
    if (p.starts_count >= 30 && p.leads_count >= 10) {
      const rate = p.leads_count / p.starts_count;
      if (rate >= 0.3) {
        out.push({
          id: `top-${p.id}`,
          title: `« ${p.title || "Sans titre"} » convertit fort`,
          body: `Taux de capture ${Math.round(rate * 100)} % — au-dessus de la moyenne. Pousse-le sur tes canaux pour amplifier.`,
          ctaLabel: "Partager le projet",
          ctaHref: `/quiz/${p.id}`,
          tone: "success",
          targetId: p.id,
        });
        break;
      }
    }
  }

  // 4. Has many drafts but few published — encourage shipping.
  if (
    input.draftProjectCount >= 2 &&
    input.activeProjects.length === 0
  ) {
    out.push({
      id: "ship-drafts",
      title: "Tu as des projets en brouillon",
      body: `${input.draftProjectCount} projet${input.draftProjectCount > 1 ? "s" : ""} en attente de publication. Lance-toi !`,
      ctaLabel: "Voir mes projets",
      ctaHref: "/quizzes",
      tone: "primary",
    });
  }

  // 5. Has quizzes but no surveys — survey suggestion as evergreen
  //    growth opportunity.
  const hasQuiz = input.activeProjects.some((p) => p.mode !== "survey");
  const hasSurvey = input.activeProjects.some((p) => p.mode === "survey");
  if (hasQuiz && !hasSurvey && input.totalLeads >= 10) {
    out.push({
      id: "first-survey",
      title: "Demande l'avis de tes leads",
      body: "Un sondage NPS de 1 minute auprès de tes contacts capturés est un gisement d'insights direct.",
      ctaLabel: "Créer un sondage",
      ctaHref: "/survey/new",
      tone: "info",
    });
  }

  return out.slice(0, 3);
}
