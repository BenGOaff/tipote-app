// lib/insights.ts
// Rule-based "smart insights" — small, opinionated suggestions derived
// directly from the user's data. NO LLM call: each rule is a tight
// pure function that looks at the snapshot and decides whether to
// surface a card.
//
// I18N: insights carry message KEYS + PARAMS rather than localised
// strings. The rendering UI (components/ui/insights-card.tsx) is the
// only place that talks to next-intl. This keeps the lib pure +
// usable from server or client without locale plumbing.

export type InsightInput = {
  activeProjects: Array<{
    id: string;
    title: string;
    starts_count: number;
    leads_count: number;
    shares_count: number;
    daysSinceActive: number | null;
    mode: "quiz" | "survey" | null;
  }>;
  totalLeads: number;
  draftProjectCount: number;
};

/**
 * Insight descriptor — UI looks up `dashboard.insights.{messageKey}.title`,
 * `.body` (or `.bodyOne` / `.bodyMany` for count-aware copy), `.cta`.
 */
export type Insight = {
  id: string;
  messageKey: "quietProject" | "lowConv" | "topPerformer" | "shipDrafts" | "firstSurvey";
  params: Record<string, string | number>;
  bodyVariant?: "one" | "many";
  ctaHref: string;
  tone: "info" | "warning" | "success" | "primary";
  targetId?: string;
};

export function computeInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  for (const p of input.activeProjects) {
    if (
      p.daysSinceActive !== null &&
      p.daysSinceActive >= 7 &&
      p.leads_count > 0 &&
      p.shares_count < 3
    ) {
      out.push({
        id: `quiet-${p.id}`,
        messageKey: "quietProject",
        params: {
          kind: p.mode === "survey" ? "survey" : "quiz",
          name: p.title || "",
          days: p.daysSinceActive,
        },
        ctaHref: `/quiz/${p.id}`,
        tone: "warning",
        targetId: p.id,
      });
      break;
    }
  }

  for (const p of input.activeProjects) {
    if (p.starts_count >= 50 && p.leads_count > 0) {
      const rate = p.leads_count / p.starts_count;
      if (rate < 0.1) {
        out.push({
          id: `low-conv-${p.id}`,
          messageKey: "lowConv",
          params: { name: p.title || "", starts: p.starts_count, rate: Math.round(rate * 100) },
          ctaHref: `/quiz/${p.id}`,
          tone: "warning",
          targetId: p.id,
        });
        break;
      }
    }
  }

  for (const p of input.activeProjects) {
    if (p.starts_count >= 30 && p.leads_count >= 10) {
      const rate = p.leads_count / p.starts_count;
      if (rate >= 0.3) {
        out.push({
          id: `top-${p.id}`,
          messageKey: "topPerformer",
          params: { name: p.title || "", rate: Math.round(rate * 100) },
          ctaHref: `/quiz/${p.id}`,
          tone: "success",
          targetId: p.id,
        });
        break;
      }
    }
  }

  if (input.draftProjectCount >= 2 && input.activeProjects.length === 0) {
    out.push({
      id: "ship-drafts",
      messageKey: "shipDrafts",
      params: { count: input.draftProjectCount },
      bodyVariant: input.draftProjectCount > 1 ? "many" : "one",
      ctaHref: "/quizzes",
      tone: "primary",
    });
  }

  const hasQuiz = input.activeProjects.some((p) => p.mode !== "survey");
  const hasSurvey = input.activeProjects.some((p) => p.mode === "survey");
  if (hasQuiz && !hasSurvey && input.totalLeads >= 10) {
    out.push({
      id: "first-survey",
      messageKey: "firstSurvey",
      params: {},
      ctaHref: "/survey/new",
      tone: "info",
    });
  }

  return out.slice(0, 3);
}
