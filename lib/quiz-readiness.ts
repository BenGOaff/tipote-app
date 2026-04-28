// lib/quiz-readiness.ts
// "Readiness score" computer for a quiz / survey row. Returns a list of
// checks (passed or not) plus a percentage so the UI can render either:
//   - a small ring "4/6"
//   - a bar with the missing items called out
//   - a single "% ready to publish"
//
// Used by the project list (Mes contenus / Mes projets) and by the
// editor (subtle nudge to finish the missing pieces). One source of
// truth so the metric never disagrees between pages.

export type ReadinessCheck = {
  /** Stable id — used as i18n key when the UI needs a label. */
  id: string;
  /** Human-readable label, default in French (callers can localise). */
  label: string;
  passed: boolean;
};

export type ReadinessReport = {
  checks: ReadinessCheck[];
  passedCount: number;
  totalCount: number;
  /** 0–100 integer. */
  percent: number;
  /** True when nothing important is missing — safe to publish. */
  ready: boolean;
};

/** Minimal shape needed from a quiz row to compute readiness. */
export type ReadinessInput = {
  mode?: "quiz" | "survey" | null;
  title?: string | null;
  introduction?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  questions?: Array<{ question_text?: string | null; options?: unknown[] | null }> | null;
  results?: Array<{ title?: string | null; description?: string | null }> | null;
  privacy_url?: string | null;
  status?: string | null;
};

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Compute readiness for a quiz or survey. Survey-mode skips the
 * "results profiles" check (they don't exist) but adds a "thank-you
 * CTA" expectation, so the score reflects the right shape.
 */
export function computeReadiness(input: ReadinessInput): ReadinessReport {
  const isSurvey = input.mode === "survey";
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const results = Array.isArray(input.results) ? input.results : [];

  const checks: ReadinessCheck[] = [];

  // 1. Title is required to even publish — keep it as the first check.
  checks.push({ id: "title", label: "Titre renseigné", passed: nonEmpty(input.title) });

  // 2. Introduction is the first thing visitors see — strongly recommend.
  checks.push({
    id: "intro",
    label: "Introduction écrite",
    passed: nonEmpty(input.introduction),
  });

  // 3. At least 3 questions for a quiz, 1 for a survey (NPS-only is
  //    legitimate). Below that the experience feels broken.
  const minQuestions = isSurvey ? 1 : 3;
  const questionsOk =
    questions.length >= minQuestions &&
    questions.every((q) => nonEmpty(q?.question_text));
  checks.push({
    id: "questions",
    label: isSurvey ? "Au moins 1 question complète" : "≥3 questions complètes",
    passed: questionsOk,
  });

  if (isSurvey) {
    // Surveys end on a thank-you screen. CTA is optional, but its
    // presence usually signals the creator thought through what comes
    // next — count it.
    checks.push({
      id: "thanks-cta",
      label: "Message de remerciement / CTA",
      passed: nonEmpty(input.cta_text),
    });
  } else {
    // Quizzes need at least 2 result profiles to make scoring meaningful.
    const resultsOk =
      results.length >= 2 && results.every((r) => nonEmpty(r?.title));
    checks.push({
      id: "results",
      label: "≥2 profils de résultat",
      passed: resultsOk,
    });
    // CTA is what monetises a quiz — separate check.
    checks.push({
      id: "cta",
      label: "CTA configuré",
      passed: nonEmpty(input.cta_text) && nonEmpty(input.cta_url),
    });
  }

  // 5. Privacy URL — RGPD safety net.
  checks.push({
    id: "privacy",
    label: "Lien politique de confidentialité",
    passed: nonEmpty(input.privacy_url),
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  // "ready" = every check passes. Stricter than percent === 100 so any
  // future check we add automatically tightens the gate.
  const ready = passedCount === totalCount;

  return { checks, passedCount, totalCount, percent, ready };
}
