// lib/weekly-goal.ts
// Pick the user's most relevant weekly goal based on where they are in
// their journey. Pure function: takes a snapshot of their data, returns
// one (or null) actionable goal.
//
// I18N: returns a message KEY + params. The card component
// (components/ui/weekly-goal-card.tsx) does the actual translation
// lookup via next-intl so this lib stays pure and locale-agnostic.

export type WeeklyGoalInput = {
  publishedCount: number;
  totalLeads: number;
  activeSurveyCount: number;
  leadsLastWeek: number;
};

/**
 * Goal descriptor. UI looks up:
 *   dashboard.weeklyGoal.{messageKey}.title
 *   dashboard.weeklyGoal.{messageKey}.desc (interpolated with `params`)
 *   dashboard.weeklyGoal.{messageKey}.cta
 */
export type WeeklyGoal = {
  id: string;
  messageKey:
    | "firstPublish"
    | "firstLead"
    | "shareAgain"
    | "firstSurvey"
    | "hundredClub"
    | "keepShipping";
  params?: Record<string, string | number>;
  ctaHref: string;
  progress?: number;
};

export function pickWeeklyGoal(input: WeeklyGoalInput): WeeklyGoal | null {
  if (input.publishedCount === 0) {
    return { id: "first-publish", messageKey: "firstPublish", ctaHref: "/quiz/new" };
  }
  if (input.totalLeads === 0) {
    return { id: "first-lead", messageKey: "firstLead", ctaHref: "/quizzes" };
  }
  if (input.leadsLastWeek === 0) {
    return { id: "share-again", messageKey: "shareAgain", ctaHref: "/quizzes" };
  }
  if (input.activeSurveyCount === 0) {
    return { id: "first-survey", messageKey: "firstSurvey", ctaHref: "/survey/new" };
  }
  if (input.totalLeads < 100) {
    return {
      id: "hundred-club",
      messageKey: "hundredClub",
      params: { remaining: 100 - input.totalLeads },
      ctaHref: "/quizzes",
      progress: input.totalLeads / 100,
    };
  }
  return { id: "keep-shipping", messageKey: "keepShipping", ctaHref: "/quiz/new" };
}
