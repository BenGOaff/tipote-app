// tests/logic/quiz-coherence.test.mts
//
// FILET DE RÉGRESSION : les bugs qui ont coûté du temps à de vraies
// clientes. Chaque bloc porte le nom de la personne et ce qu'elle a vu.
// Un test qui casse ici = un client qui va perdre confiance.
//
// Lancé par `npm run test:logic` (runner natif Node, aucune dépendance).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeResultCoverage,
  analyzeResultTies,
  attributionMode,
} from "../../lib/quizCoherence.ts";
import { analyzeTrancheCoverage, computeReachableRange } from "../../lib/quizScoring.ts";

describe("Véronique : un quiz SCORÉ ne doit jamais crier au faux problème", () => {
  // Son quiz : les options portent des POINTS, pas de result_index utile.
  // Les 4 résultats se départagent par tranche. C'est valide.
  const scoredQuestions = Array.from({ length: 10 }, () => ({
    options: [
      { result_index: 0, points: 0 },
      { result_index: 0, points: 3 },
      { result_index: 0, points: 7 },
    ],
    config: null,
  }));

  test("aucun résultat n'est declaré inatteignable", () => {
    const cov = analyzeResultCoverage("scoring", scoredQuestions, 4);
    assert.equal(cov.length, 4);
    for (const c of cov) {
      assert.equal(c.severity, "ok", "un quiz scoré ne doit produire AUCUNE alerte de couverture");
    }
  });

  test("aucun ex-æquo n'est signalé", () => {
    const ties = analyzeResultTies("scoring", scoredQuestions, 4);
    assert.equal(ties.conflicts.length, 0);
  });

  test("la tranche 51-67 de son Résultat 4 reste valide", () => {
    // 10 questions, meilleure option à 7 points -> 0 à 70 atteignables.
    const range = computeReachableRange(
      scoredQuestions.map((q) => ({
        question_type: "multiple_choice",
        options: q.options,
        config: null,
      })),
    );
    assert.equal(range.min, 0);
    assert.equal(range.max, 70);

    const results = [
      { min_score: 0, max_score: 17 },
      { min_score: 18, max_score: 34 },
      { min_score: 35, max_score: 50 },
      { min_score: 51, max_score: 67 },
    ];
    const issues = analyzeTrancheCoverage(results, range.min, range.max);
    // Le seul reproche possible ici est le trou 68-70 en haut de plage,
    // JAMAIS "ce résultat est inatteignable".
    for (const i of issues) {
      assert.notEqual(i.kind, "unreachable", `alerte parasite : ${JSON.stringify(i)}`);
    }
  });
});

describe("Le contrôle profils reste actif là où il sert", () => {
  test("un profil vers lequel aucune option ne mène est signalé", () => {
    const questions = [
      { options: [{ result_index: 0 }, { result_index: 1 }], config: null },
      { options: [{ result_index: 0 }, { result_index: 1 }], config: null },
    ];
    const cov = analyzeResultCoverage("profiles", questions, 3);
    assert.equal(cov[2]!.severity, "danger", "le profil 3 est vraiment inatteignable");
    assert.equal(cov[0]!.severity, "ok");
  });

  test("un quiz à profils équilibré ne dit rien", () => {
    const questions = Array.from({ length: 4 }, () => ({
      options: [{ result_index: 0 }, { result_index: 1 }],
      config: null,
    }));
    const cov = analyzeResultCoverage("profiles", questions, 2);
    for (const c of cov) assert.equal(c.severity, "ok");
  });
});

describe("attributionMode : tout ce qui n'est pas scoring est un quiz à profils", () => {
  test("les valeurs connues", () => {
    assert.equal(attributionMode("scoring"), "scoring");
    assert.equal(attributionMode("profiles"), "profiles");
  });

  test("null, undefined et l'inconnu retombent sur profils", () => {
    // Fail-safe : mieux vaut afficher un contrôle de trop sur un quiz à
    // profils que de rendre muet un vrai problème.
    assert.equal(attributionMode(null), "profiles");
    assert.equal(attributionMode(undefined), "profiles");
    assert.equal(attributionMode("survey"), "profiles");
  });
});
