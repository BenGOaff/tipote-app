// Ex-æquo detector pour les quiz (Adeline, 19 mai 2026).
//
// Énumère toutes les combinaisons possibles de réponses (cap 100k) et
// détecte celles qui produisent un ex-æquo entre 2+ résultats. Surface
// les conflits à l'éditeur via un warning banner pour que le créateur
// puisse ajuster les points avant de publier.
//
// Tiebreaker runtime : déjà déterministe côté visiteur — `computeResult`
// utilise `if (s > maxScore)` (strict GT), donc le résultat avec le
// `sort_order` le plus bas gagne en cas d'ex-æquo. Pas "arbitraire",
// mais l'auteur ignore souvent que c'est ce qui se passe. Le warning
// le rend visible.

export type AnalyzerQuestion = {
  options: { result_index: number }[];
  config?: { multi_select?: boolean } | null;
  question_type?: string | null;
};

export type TieConflict = {
  /** Result indices that ended tied at max score */
  resultIndices: number[];
  /** Per-question option index that produced this conflict */
  answers: number[];
  /** Score reached by the tied results */
  score: number;
};

export type TieAnalysis = {
  conflicts: TieConflict[];
  totalCombinations: number;
  analyzed: number;
  /** True if the combinatorial space exceeded the cap → analysis incomplete */
  truncated: boolean;
  /** True if some questions were skipped (multi-select, free-text, …) */
  hasSkipped: boolean;
};

const MAX_COMBINATIONS = 100_000;
// Cap the number of conflict samples surfaced — 5 is plenty for the
// creator to identify the pattern without overwhelming the UI.
const MAX_CONFLICTS_REPORTED = 5;

/**
 * Run the analyzer. Returns the list of ex-æquo paths (up to
 * MAX_CONFLICTS_REPORTED) and metadata about the run.
 *
 * Performance: O(combinations × questions × results). For a typical
 * quiz (8 questions × 4 options × 4 results) that's 65536 × 8 × 4 =
 * ~2M ops, well under 100ms in a browser.
 */
export function analyzeTies(
  questions: AnalyzerQuestion[],
  resultCount: number,
): TieAnalysis {
  if (resultCount < 2 || questions.length === 0) {
    return { conflicts: [], totalCombinations: 0, analyzed: 0, truncated: false, hasSkipped: false };
  }

  // Build a per-question "effective options" list. Skip questions
  // whose answer doesn't contribute to scoring (free_text, rating,
  // multi_select — these have unbounded or non-deterministic
  // contributions). We replace them with a single placeholder option
  // that adds 0 to every result, so they still occupy a slot in the
  // combinations index but don't affect outcomes.
  let hasSkipped = false;
  const slots = questions.map((q) => {
    const skip =
      q.config?.multi_select === true ||
      q.question_type === "free_text" ||
      q.question_type === "rating_scale" ||
      q.question_type === "star_rating";
    if (skip) {
      hasSkipped = true;
      return { options: [{ result_index: -1 }], skipped: true };
    }
    // Need at least one option for the iteration to fire
    return { options: q.options.length > 0 ? q.options : [{ result_index: -1 }], skipped: false };
  });

  const totalCombinations = slots.reduce((a, b) => a * b.options.length, 1);
  const truncated = totalCombinations > MAX_COMBINATIONS;
  const analyzed = Math.min(totalCombinations, MAX_COMBINATIONS);

  const conflicts: TieConflict[] = [];
  // We dedupe by sorted result indices so we don't surface 5 distinct
  // paths that all reveal the same A↔B conflict — surfacing 5 _pairs_
  // is more useful for the creator.
  const seenPairs = new Set<string>();

  const idx = new Array(slots.length).fill(0);
  const scores = new Array(resultCount).fill(0);

  for (let n = 0; n < analyzed; n++) {
    scores.fill(0);
    for (let q = 0; q < slots.length; q++) {
      const opt = slots[q].options[idx[q]];
      const ri = opt.result_index;
      if (ri >= 0 && ri < resultCount) scores[ri]++;
    }
    // Find max
    let maxScore = -1;
    for (let i = 0; i < resultCount; i++) {
      if (scores[i] > maxScore) maxScore = scores[i];
    }
    // Need at least one option contributing to flag a tie — pure-zero
    // scores (e.g. all skipped questions) aren't a real conflict.
    if (maxScore > 0) {
      const tied: number[] = [];
      for (let i = 0; i < resultCount; i++) {
        if (scores[i] === maxScore) tied.push(i);
      }
      if (tied.length > 1) {
        const key = tied.join("-");
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          conflicts.push({
            resultIndices: tied,
            answers: [...idx],
            score: maxScore,
          });
          if (conflicts.length >= MAX_CONFLICTS_REPORTED) break;
        }
      }
    }

    // Increment indices (rightmost first, like an odometer)
    for (let q = slots.length - 1; q >= 0; q--) {
      idx[q]++;
      if (idx[q] < slots[q].options.length) break;
      idx[q] = 0;
    }
  }

  return { conflicts, totalCombinations, analyzed, truncated, hasSkipped };
}
