// Ex-æquo detector pour les quiz (Adeline, 19 mai 2026).
//
// Énumère toutes les combinaisons possibles de réponses (cap 100k) et
// détecte celles où le viewer ne saurait PAS trancher entre 2 profils.
//
// CE QU'IL SIGNALE A CHANGÉ LE 3 AOÛT 2026, et c'est le coeur du retour
// de Béné ("cette histoire d'ex-æquo, c'est chiant à mourir").
//
// Avant, il signalait toute égalité de SCORE. Le viewer, lui, tranchait
// silencieusement par l'ordre des profils : le premier gagnait toujours.
// L'analyseur avait donc raison sur le fond (le résultat ne dépendait
// pas des réponses) mais il listait des dizaines de chemins sans jamais
// dire quoi en faire, et aucune redistribution de points ne pouvait les
// faire disparaître.
//
// Depuis, le départage se fait sur les RÉPONSES du visiteur
// (lib/quiz/profileWinner.ts). Un chemin n'est plus un problème dès que
// cette chaîne sait le trancher, et il ne reste à signaler que les
// profils strictement indiscernables sur toute la copie : là, oui, la
// créatrice doit intervenir.
//
// L'analyseur appelle LA fonction du viewer, il ne la réimplémente pas.
// Recopiée, elle divergerait, et le bandeau se remettrait à parler
// d'égalités qui n'arrivent jamais.

import {
  pickProfileWinner,
  tallyVotes,
  type ProfileVote,
  type TieBreak,
} from "./quiz/profileWinner.ts";

export type AnalyzerQuestion = {
  options: { result_index: number; points?: number | null }[];
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
  /**
   * Le MÊME réglage que le quiz publié. Paramètre OBLIGATOIRE : deviné
   * à l'intérieur, il finirait par ne plus correspondre à ce que vit le
   * visiteur, et l'éditeur mentirait (cf. la règle du 1er août sur les
   * mécaniques passées en paramètre).
   */
  tieBreak: TieBreak,
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
  const votes: ProfileVote[] = [];

  for (let n = 0; n < analyzed; n++) {
    votes.length = 0;
    for (let q = 0; q < slots.length; q++) {
      const opt = slots[q].options[idx[q]];
      votes.push({
        resultIndex: opt.result_index,
        // Poids de la reponse (defaut 1) : coherent avec computeResult
        // cote visiteur qui somme `points` (mode profil pondere).
        weight: typeof opt.points === "number" ? opt.points : 1,
        questionIndex: q,
      });
    }
    // LE depouillement du viewer, pas une copie. `tiedAfter` ne porte
    // que les profils que la chaine de departage n'a PAS su separer.
    const tally = tallyVotes(votes, resultCount);
    const { index, tiedAfter } = pickProfileWinner(tally, tieBreak);
    if (tiedAfter.length > 1) {
      const key = tiedAfter.join("-");
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        conflicts.push({
          resultIndices: tiedAfter,
          answers: [...idx],
          score: tally.scores[index] ?? 0,
        });
        if (conflicts.length >= MAX_CONFLICTS_REPORTED) break;
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
