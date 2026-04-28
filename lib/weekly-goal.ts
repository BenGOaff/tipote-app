// lib/weekly-goal.ts
// Pick the user's most relevant weekly goal based on where they are in
// their journey. Pure function: takes a snapshot of their data, returns
// one (or null) actionable goal.
//
// Rationale: instead of letting the user sit at "0 leads, 0 quizzes"
// indefinitely, surface the next concrete step in plain language right
// on the dashboard. Once they hit it the next goal naturally takes over.
//
// USAGE
// ─────
//   const goal = pickWeeklyGoal({
//     publishedCount: 0,
//     totalLeads: 12,
//     activeSurveyCount: 0,
//     leadsLastWeek: 3,
//   });
//   if (goal) {
//     <WeeklyGoalCard goal={goal} />
//   }

export type WeeklyGoalInput = {
  publishedCount: number;
  totalLeads: number;
  /** Active surveys (mode='survey'). Surveys are a separate "next step"
   *  for users who already have a quiz funnel running. */
  activeSurveyCount: number;
  /** Leads earned in the last 7 days — used to nudge sharing when low. */
  leadsLastWeek: number;
};

export type WeeklyGoal = {
  id: string;
  title: string;
  description: string;
  /** What the CTA says, e.g. "Créer mon quiz". */
  ctaLabel: string;
  /** Where the CTA points. */
  ctaHref: string;
  /** Optional progress fraction (0..1). When set, the card shows a bar. */
  progress?: number;
};

/**
 * Order matters: goals are checked top-down and the first one that
 * applies wins. This means a brand-new user always sees "publish your
 * first quiz" first, then "capture your first 10 leads", and so on.
 */
export function pickWeeklyGoal(input: WeeklyGoalInput): WeeklyGoal | null {
  // 1. No project yet — first publish is THE goal.
  if (input.publishedCount === 0) {
    return {
      id: "first-publish",
      title: "Publie ton premier quiz",
      description: "Une fois ton quiz prêt, partage-le pour capturer tes premiers leads.",
      ctaLabel: "Créer un quiz",
      ctaHref: "/quiz/new",
    };
  }

  // 2. Has projects but no leads yet — sharing is the next move.
  if (input.totalLeads === 0) {
    return {
      id: "first-lead",
      title: "Capture ton premier lead",
      description: "Partage le lien de ton quiz à ton audience pour récolter ta première réponse.",
      ctaLabel: "Voir mes projets",
      ctaHref: "/quizzes",
    };
  }

  // 3. Has leads but very low recent activity — nudge to keep momentum.
  if (input.leadsLastWeek === 0) {
    return {
      id: "share-again",
      title: "Repartage cette semaine",
      description: "Aucune nouvelle réponse cette semaine — un repartage relance souvent le flux.",
      ctaLabel: "Voir mes projets",
      ctaHref: "/quizzes",
    };
  }

  // 4. Has quizzes but no surveys yet — surveys are the natural next
  //    step for a creator who's already capturing leads.
  if (input.activeSurveyCount === 0) {
    return {
      id: "first-survey",
      title: "Crée un sondage NPS",
      description: "Demande à tes clients ce qu'ils pensent de toi en 1 minute. Boost la rétention.",
      ctaLabel: "Créer un sondage",
      ctaHref: "/survey/new",
    };
  }

  // 5. Stretch goal — capture 100 leads. Shows progress.
  if (input.totalLeads < 100) {
    return {
      id: "hundred-club",
      title: "Vise les 100 leads",
      description: `Plus que ${100 - input.totalLeads} pour intégrer le club des 100.`,
      ctaLabel: "Voir mes projets",
      ctaHref: "/quizzes",
      progress: input.totalLeads / 100,
    };
  }

  // 6. Power user — keep shipping. Soft goal, no urgency.
  return {
    id: "keep-shipping",
    title: "Continue sur ta lancée",
    description: "Tu as déjà 100+ leads. Lance un nouveau quiz cette semaine pour étendre ton audience.",
    ctaLabel: "Créer un quiz",
    ctaHref: "/quiz/new",
  };
}
