// lib/achievements.ts
// Achievements / badges detector. Pure function: takes a snapshot of
// the user's data and returns the list of unlocked + locked badges.
// No schema, no cron, no separate tracking — everything is derived
// from the data the user already has.
//
// I18N: the badge label + hint are NOT included on the Achievement
// object. The UI looks them up by id at
//   dashboard.achievements.{id}.label
//   dashboard.achievements.{id}.hint
// so the lib stays pure and locale-agnostic.

export type AchievementInput = {
  publishedCount: number;
  activeCount: number;
  totalLeads: number;
  distinctLocales: number;
  activeSurveyCount: number;
  bestConversionRate: number;
  weeklyHotStreak: boolean;
};

/** Stable identifier doubling as i18n sub-key under `dashboard.achievements.*`. */
export type AchievementId =
  | "first_publish"
  | "launcher"
  | "first_lead"
  | "hundred_club"
  | "thousand_club"
  | "polyglot"
  | "survey_master"
  | "hot_streak"
  | "conversion_25"
  | "library";

export type Achievement = {
  id: AchievementId;
  icon:
    | "rocket"
    | "trophy"
    | "globe"
    | "flame"
    | "compass"
    | "library"
    | "sparkles"
    | "star";
  tone: "primary" | "amber" | "emerald" | "violet" | "rose" | "sky" | "cyan";
  unlocked: boolean;
};

/**
 * Run the achievement rules against a user's snapshot. Order of the
 * returned array is the display order — unlocked items aren't sorted
 * to the top (the UI does that if it wants to).
 */
export function detectAchievements(input: AchievementInput): Achievement[] {
  return [
    { id: "first_publish", icon: "rocket", tone: "primary", unlocked: input.publishedCount >= 1 },
    { id: "launcher", icon: "rocket", tone: "violet", unlocked: input.publishedCount >= 5 },
    { id: "first_lead", icon: "sparkles", tone: "primary", unlocked: input.totalLeads >= 1 },
    { id: "hundred_club", icon: "trophy", tone: "amber", unlocked: input.totalLeads >= 100 },
    { id: "thousand_club", icon: "trophy", tone: "amber", unlocked: input.totalLeads >= 1000 },
    { id: "polyglot", icon: "globe", tone: "sky", unlocked: input.distinctLocales >= 2 },
    { id: "survey_master", icon: "compass", tone: "violet", unlocked: input.activeSurveyCount >= 3 },
    { id: "hot_streak", icon: "flame", tone: "rose", unlocked: input.weeklyHotStreak },
    { id: "conversion_25", icon: "star", tone: "emerald", unlocked: input.bestConversionRate >= 0.25 },
    { id: "library", icon: "library", tone: "cyan", unlocked: input.publishedCount >= 10 },
  ];
}
