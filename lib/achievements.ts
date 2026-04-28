// lib/achievements.ts
// Achievements / badges detector. Pure function: takes a snapshot of
// the user's data and returns the list of unlocked + locked badges.
// No schema, no cron, no separate tracking — everything is derived
// from the data the user already has, so badges materialise the
// instant they're earned.
//
// USAGE
// ─────
//   const badges = detectAchievements({
//     publishedCount: 3,
//     totalLeads: 124,
//     activeSurveyCount: 1,
//     ...
//   });
//   const unlocked = badges.filter((b) => b.unlocked);

export type AchievementInput = {
  /** Number of projects (quizzes + surveys) ever published. */
  publishedCount: number;
  /** Number of currently-active projects. */
  activeCount: number;
  /** Total leads / responses captured across all projects. */
  totalLeads: number;
  /** Number of distinct locales used across projects. */
  distinctLocales: number;
  /** Number of currently-active surveys (mode='survey'). */
  activeSurveyCount: number;
  /** Highest single-project conversion rate (leads / starts), 0..1. */
  bestConversionRate: number;
  /** Did at least one project earn ≥7 leads in the last 7 days? */
  weeklyHotStreak: boolean;
};

export type Achievement = {
  /** Stable id — used as react key, i18n key, persistence id later. */
  id: string;
  /** Short label shown next to the icon. */
  label: string;
  /** One-line description explaining how it's earned. */
  hint: string;
  /** Lucide icon key — the UI maps these to actual components. */
  icon:
    | "rocket"
    | "trophy"
    | "globe"
    | "flame"
    | "compass"
    | "library"
    | "sparkles"
    | "star";
  /** Soft-tone palette key — drives the badge background. */
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
    {
      id: "first_publish",
      label: "Premier projet",
      hint: "Publie ton premier quiz ou sondage",
      icon: "rocket",
      tone: "primary",
      unlocked: input.publishedCount >= 1,
    },
    {
      id: "launcher",
      label: "Lanceur",
      hint: "Publie 5 projets ou plus",
      icon: "rocket",
      tone: "violet",
      unlocked: input.publishedCount >= 5,
    },
    {
      id: "first_lead",
      label: "Premier lead",
      hint: "Capture ta première réponse",
      icon: "sparkles",
      tone: "primary",
      unlocked: input.totalLeads >= 1,
    },
    {
      id: "hundred_club",
      label: "Club des 100",
      hint: "Cumule 100 réponses ou plus",
      icon: "trophy",
      tone: "amber",
      unlocked: input.totalLeads >= 100,
    },
    {
      id: "thousand_club",
      label: "Mille fois bravo",
      hint: "Cumule 1 000 réponses ou plus",
      icon: "trophy",
      tone: "amber",
      unlocked: input.totalLeads >= 1000,
    },
    {
      id: "polyglot",
      label: "Polyglotte",
      hint: "Publie dans au moins 2 langues",
      icon: "globe",
      tone: "sky",
      unlocked: input.distinctLocales >= 2,
    },
    {
      id: "survey_master",
      label: "Pro du sondage",
      hint: "Aie 3 sondages actifs en même temps",
      icon: "compass",
      tone: "violet",
      unlocked: input.activeSurveyCount >= 3,
    },
    {
      id: "hot_streak",
      label: "En forme",
      hint: "Reçois 7 réponses sur 7 jours",
      icon: "flame",
      tone: "rose",
      unlocked: input.weeklyHotStreak,
    },
    {
      id: "conversion_25",
      label: "Convertisseur",
      hint: "Atteins 25 % de taux de capture",
      icon: "star",
      tone: "emerald",
      unlocked: input.bestConversionRate >= 0.25,
    },
    {
      id: "library",
      label: "Bibliothèque",
      hint: "Aie 10 projets ou plus",
      icon: "library",
      tone: "cyan",
      unlocked: input.publishedCount >= 10,
    },
  ];
}
