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
import { type TieBreak } from "./quiz/profileWinner.ts";

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
  /** `multiple_choice`, `yes_no`, `free_text`, `rating_scale`, `star_rating`. */
  question_type?: string | null;
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
  /**
   * Comment CE quiz tranche une egalite. Parametre obligatoire, comme le
   * mode : devine a l'interieur, il finirait par ne plus correspondre a
   * ce que vit le visiteur, et l'editeur alerterait sur des cas qui
   * n'arrivent jamais.
   */
  tieBreak: TieBreak,
): TieAnalysis {
  if (mode === "scoring") return EMPTY_TIES;
  return analyzeTies(
    questions.map((q) => ({
      options: q.options.map((o) => ({ result_index: o.result_index, points: o.points })),
      config: q.config ?? null,
      question_type: q.question_type ?? null,
    })),
    resultCount,
    tieBreak,
  );
}

// ── Assez de réponses pour tous les profils ? ────────────────────────

/**
 * ESCALADE VÉRONIQUE, 3 août 2026, par le coach de l'Atelier :
 *
 *   "configuration 2 axes croisés pour 4 profils dans Tiquiz.
 *    Comme il n'y a que 3 réponses possibles par question et 4
 *    résultats, forcément ça déconne."
 *
 * Elle a raison sur le fait, et sa conclusion est la bonne. En mode
 * profils, le résultat est celui qui reçoit le plus de voix, et une voix
 * ne peut venir que d'une option portant son `result_index`. Une question
 * qui n'offre que 3 réponses ne peut donc voter que pour 3 profils sur 4 :
 * à cette question, le 4e profil est HORS COURSE. Répété sur tout le
 * quiz, ça donne un profil que personne n'obtient jamais, et le bandeau
 * rouge "Ce résultat ne peut jamais être attribué".
 *
 * Le message d'aide disait "ajuste les options de tes questions ou
 * demande à l'IA de rééquilibrer". Les deux sont vrais mais aucun ne
 * nomme la cause, et une créatrice débutante ne peut pas la deviner : il
 * FAUT lui dire qu'il manque des réponses, pas qu'il faut les déplacer.
 * Déplacer un `result_index` d'un profil vers un autre laisse toujours un
 * profil découvert quand il y a moins de réponses que de profils.
 *
 * Ce qu'on ne compte PAS, et pourquoi :
 * - mode scoring : `result_index` n'y veut rien dire (le résultat vient
 *   de la tranche de points). Cf. l'en-tête de ce fichier.
 * - `free_text`, `rating_scale`, `star_rating` : ils n'ont pas d'options
 *   du tout, ce n'est pas un manque (retour Jocelyne, 1er août).
 * - `yes_no` : deux réponses, c'est le principe même du type. Le
 *   signaler serait un reproche permanent sur une question saine.
 */
export type OptionSupply = {
  /** Nombre de profils à couvrir. */
  resultCount: number;
  /** Index des questions à choix qui offrent moins de réponses que de profils. */
  shortQuestions: number[];
  /** Le plus petit nombre de réponses observé parmi ces questions (0 si aucune). */
  minOptions: number;
  /** Y a-t-il au moins une question en manque ? */
  short: boolean;
};

const EMPTY_SUPPLY = (resultCount: number): OptionSupply => ({
  resultCount,
  shortQuestions: [],
  minOptions: 0,
  short: false,
});

export function analyzeOptionSupply(
  mode: QuizAttributionMode,
  questions: CoherenceQuestion[],
  resultCount: number,
): OptionSupply {
  if (mode === "scoring" || resultCount < 2) return EMPTY_SUPPLY(resultCount);

  const shortQuestions: number[] = [];
  let minOptions = Number.POSITIVE_INFINITY;

  questions.forEach((q, qi) => {
    const type = (q.question_type ?? "multiple_choice") || "multiple_choice";
    if (type === "yes_no") return;
    const count = q.options.length;
    // Zéro option = type sans options (texte libre, échelle, étoiles).
    if (count === 0) return;
    if (count < resultCount) {
      shortQuestions.push(qi);
      if (count < minOptions) minOptions = count;
    }
  });

  return {
    resultCount,
    shortQuestions,
    minOptions: Number.isFinite(minOptions) ? minOptions : 0,
    short: shortQuestions.length > 0,
  };
}

/**
 * Combien de réponses il manque à une question pour qu'un visiteur puisse
 * y choisir n'importe lequel des profils.
 *
 * Sert au bouton qui ajoute les réponses manquantes : il n'en ajoute
 * jamais plus que ça, sinon on fabrique des réponses en trop.
 */
export function missingOptionCount(optionCount: number, resultCount: number): number {
  return Math.max(0, resultCount - Math.max(0, optionCount));
}

/**
 * Les questions où un profil est HORS COURSE alors que la question a
 * pourtant assez de réponses.
 *
 * -- POURQUOI CE CONTRÔLE EXISTE (Damien, 27 août 2026) ---------------
 *
 * Son quiz a 4 profils et 8 questions. Aux questions 4 et 8, la dernière
 * réponse décrit sans ambiguïté son profil 3 ("Trouver suffisamment de
 * personnes intéressées", "Mon offre se vend régulièrement") et porte
 * `result_index: 0`. Le profil 3 ne pouvait donc gagner aucune voix sur
 * ces deux questions, et le profil 0 en gagnait deux qu'il n'aurait pas
 * dû avoir.
 *
 * **Aucun de nos deux contrôles ne pouvait le voir**, et c'est ça le
 * défaut :
 *   - `analyzeOptionSupply` ne compte que le NOMBRE de réponses. 4
 *     réponses pour 4 profils : il est content.
 *   - `analyzeResultCoverage` compte les questions où un profil apparaît
 *     AU MOINS UNE FOIS, sur tout le quiz. Le profil 3 apparaît dans 6
 *     questions sur 8, le seuil attendu est 2 : il est content aussi.
 *
 * C'est la famille du drame Véronique du 3 août ("moins de réponses que
 * de profils") par la porte qu'on n'avait pas fermée : le compte est bon,
 * c'est la RÉPARTITION qui ne l'est pas.
 *
 * ON NE SIGNALE QUE LES QUESTIONS QUI ONT ASSEZ DE RÉPONSES, et ce n'est
 * pas un détail : une question trop courte est déjà nommée par
 * `analyzeOptionSupply`, avec sa propre cause et sa propre action. Le
 * dire deux fois transformerait deux alertes utiles en bruit, et Béné a
 * déjà tranché là dessus ("tu empiles les trucs, ça devient n'importe
 * quoi l'éditeur").
 *
 * @returns un tableau indexé par résultat ; chaque entrée porte les
 *   index (0-based) des questions où ce résultat ne peut rien gagner.
 */
export function analyzeProfileGaps(
  mode: QuizAttributionMode,
  questions: CoherenceQuestion[],
  resultCount: number,
): number[][] {
  const vide = (): number[][] => Array.from({ length: Math.max(0, resultCount) }, () => []);

  // En scoring, `result_index` ne veut rien dire : le résultat vient de
  // la tranche de points. Même garde que ses deux voisines, pour la même
  // raison (drame Véronique, 1er août).
  if (mode === "scoring" || resultCount < 2) return vide();

  const gaps = vide();

  questions.forEach((q, qi) => {
    const type = (q.question_type ?? "multiple_choice") || "multiple_choice";
    // `yes_no` a deux réponses par principe, et les types sans options
    // (texte libre, échelle, étoiles) n'en ont aucune : ce ne sont pas
    // des manques, c'est leur nature.
    if (type === "yes_no") return;
    if (q.options.length === 0) return;
    // Question trop courte : `analyzeOptionSupply` s'en charge.
    if (q.options.length < resultCount) return;

    const servis = new Set(q.options.map((o) => o.result_index));
    for (let ri = 0; ri < resultCount; ri += 1) {
      if (!servis.has(ri)) gaps[ri].push(qi);
    }
  });

  return gaps;
}
