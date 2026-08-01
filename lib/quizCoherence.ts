// lib/quizCoherence.ts
//
// Contrôles de cohérence des RÉSULTATS d'un quiz, pour l'éditeur.
//
// POURQUOI CE MODULE EXISTE (drame Véronique, 1er août 2026).
// Tiquiz attribue le résultat de DEUX façons, et elles n'ont rien à voir :
//
//   mode "profiles" : le résultat le plus voté, via `option.result_index`
//   mode "scoring"  : la tranche [min_score, max_score], via `option.points`
//
// Les analyses de couverture et d'ex-æquo sont bâties sur `result_index`.
// Appliquées telles quelles à un quiz scoré, elles répondent zéro pour
// tous les résultats et affichent "Ce résultat ne peut jamais être
// attribué" sur un quiz parfaitement fonctionnel. Véronique testait, avait
// le bon résultat, et voyait quand même l'alerte. Deux jours perdus.
//
// La leçon est dans la SIGNATURE : `mode` est le PREMIER paramètre, et il
// est obligatoire. On ne peut plus appeler ces analyses sans avoir dit de
// quelle mécanique on parle. C'est la seule protection qui survit au
// prochain qui touchera au fichier.
//
// Le contrôle pertinent en scoring est ailleurs et reste actif :
// `analyzeTrancheCoverage` (lib/quizScoring.ts), qui compare les tranches
// à la plage réellement atteignable.

// Extension explicite : le runner de tests natif de Node resout les
// imports comme le fait le navigateur (pas de resolution "magique" sans
// extension). C'est ce qui permet de tester ce module sans bundler.
import { analyzeTies, type TieAnalysis } from "./quizTieAnalysis.ts";

export type QuizAttributionMode = "profiles" | "scoring";

/** `quizzes.mode` -> mécanique d'attribution. Tout le reste = profils. */
export function attributionMode(mode: string | null | undefined): QuizAttributionMode {
  return mode === "scoring" ? "scoring" : "profiles";
}

export type CoverageSeverity = "ok" | "warn" | "danger";

export type ResultCoverage = {
  /** Nombre de questions dont au moins une option mène à ce résultat. */
  questionsLeading: number;
  totalQuestions: number;
  /** Couverture attendue pour un quiz équilibré (questions / résultats). */
  expected: number;
  severity: CoverageSeverity;
};

export type CoherenceQuestion = {
  options: { result_index: number; points?: number | null }[];
  config?: { multi_select?: boolean } | null;
};

const EMPTY_TIES: TieAnalysis = {
  conflicts: [],
  totalCombinations: 0,
  analyzed: 0,
  truncated: false,
  hasSkipped: false,
};

/**
 * Combien de questions peuvent mener à chaque résultat, et à quel point
 * c'est déséquilibré.
 *
 * En mode "scoring" : renvoie `ok` partout, SANS RIEN CALCULER. Ce n'est
 * pas une tolérance, c'est que la question n'a pas de sens : le résultat
 * ne dépend pas des `result_index` mais de la tranche de points.
 */
export function analyzeResultCoverage(
  mode: QuizAttributionMode,
  questions: CoherenceQuestion[],
  resultCount: number,
): ResultCoverage[] {
  const N = questions.length;
  const R = Math.max(1, resultCount);
  const expected = Math.max(1, Math.ceil(N / R));

  if (mode === "scoring") {
    return Array.from({ length: resultCount }, () => ({
      questionsLeading: N,
      totalQuestions: N,
      expected,
      severity: "ok" as CoverageSeverity,
    }));
  }

  return Array.from({ length: resultCount }, (_unused, ri) => {
    const questionsLeading = questions.reduce(
      (acc, q) => acc + (q.options.some((o) => o.result_index === ri) ? 1 : 0),
      0,
    );
    const severity: CoverageSeverity =
      questionsLeading === 0 ? "danger" : questionsLeading < expected ? "warn" : "ok";
    return { questionsLeading, totalQuestions: N, expected, severity };
  });
}

/**
 * Chemins de réponses qui produisent un ex-æquo entre 2+ résultats.
 *
 * En mode "scoring" : aucun conflit, SANS RIEN CALCULER. Deux résultats
 * ne peuvent pas être ex-æquo par `result_index`, ils se départagent par
 * tranche de points.
 */
export function analyzeResultTies(
  mode: QuizAttributionMode,
  questions: CoherenceQuestion[],
  resultCount: number,
): TieAnalysis {
  if (mode === "scoring") return EMPTY_TIES;
  return analyzeTies(
    questions.map((q) => ({
      options: q.options.map((o) => ({ result_index: o.result_index, points: o.points })),
      config: q.config ?? null,
    })),
    resultCount,
  );
}
