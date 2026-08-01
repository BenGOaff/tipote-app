// tests/logic/quiz-stats.test.mts
//
// Statistiques : les deux retours qui ont fait douter des chiffres.
//   - Adeline : "la pire chute est de Q9 à Q10, or Q10 n'existe plus"
//   - Adeline : une question supprimée AU MILIEU décale tout l'historique

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestionPositions,
  indexAnswersByPosition,
  resolveQuestionPosition,
} from "../../lib/quiz/questionIdentity.ts";
import { buildLiveFunnel, reachedLastQuestion } from "../../lib/quiz/funnel.ts";

describe("Adeline : le funnel ne parle que de questions qui existent", () => {
  test("la ligne sentinelle devient un compteur honnête, pas une étape", () => {
    const { steps, removedQuestions } = buildLiveFunnel(
      [
        { question_index: -1, views: 2 },
        { question_index: 0, views: 100 },
        { question_index: 1, views: 60 },
      ],
      3,
    );
    assert.equal(removedQuestions, 2, "2 questions supprimées, dites explicitement");
    assert.equal(steps.length, 3, "3 questions vivantes, ni plus ni moins");
    assert.ok(steps.every((s) => s.questionIndex >= 0), "aucune étape fantôme");
  });

  test("une question ajoutée après coup dit 'pas encore de donnée', pas '0 visiteur'", () => {
    const { steps } = buildLiveFunnel(
      [
        { question_index: 0, views: 100 },
        { question_index: 1, views: 60 },
      ],
      3,
    );
    assert.equal(steps[2]!.hasData, false);
    assert.equal(steps[1]!.hasData, true);
  });

  test("'restés jusqu'au bout' se calcule sur la dernière question QUI A de la donnée", () => {
    const { steps } = buildLiveFunnel(
      [
        { question_index: 0, views: 100 },
        { question_index: 1, views: 60 },
      ],
      3,
    );
    assert.equal(reachedLastQuestion(steps), 60, "jamais 0 à cause d'une question sans event");
  });

  test("la pire chute ignore les étapes sans donnée", () => {
    const { steps } = buildLiveFunnel(
      [
        { question_index: 0, views: 100 },
        { question_index: 1, views: 60 },
      ],
      3,
    );
    const tracked = steps.filter((s) => s.hasData);
    const worst = Math.max(...tracked.map((s) => s.dropFromPrevious ?? 0));
    assert.equal(worst, 40, "40% de Q1 à Q2, et surtout pas 100% vers une question vide");
  });
});

describe("Adeline : supprimer une question au milieu ne décale plus rien", () => {
  const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const after = [{ id: "a" }, { id: "c" }]; // b supprimée

  test("une réponse suit SA question, pas sa position d'origine", () => {
    const positions = buildQuestionPositions(after);
    assert.equal(resolveQuestionPosition({ question_id: "c", question_index: 2 }, positions, 2), 1);
  });

  test("la réponse d'une question supprimée est exclue, jamais réattribuée", () => {
    const positions = buildQuestionPositions(after);
    assert.equal(resolveQuestionPosition({ question_id: "b", question_index: 1 }, positions, 2), null);
  });

  test("le tableau des réponses ne glisse plus d'un cran", () => {
    const answers = [
      { question_id: "a", question_index: 0, text: "A" },
      { question_id: "b", question_index: 1, text: "B" },
      { question_id: "c", question_index: 2, text: "C" },
    ];
    const byPos = indexAnswersByPosition(answers, buildQuestionPositions(after), 2);
    assert.equal(byPos.get(0)?.text, "A");
    assert.equal(byPos.get(1)?.text, "C", "C reste sur C, ce n'est pas B qui remonte");
    assert.equal(byPos.size, 2);
  });

  test("l'historique sans id reste lisible tant qu'il vise une question vivante", () => {
    const positions = buildQuestionPositions(before);
    assert.equal(resolveQuestionPosition({ question_index: 1 }, positions, 3), 1);
    assert.equal(resolveQuestionPosition({ question_index: 7 }, positions, 3), null);
  });

  test("structure inconnue : on rend la donnée brute plutôt qu'un écran vide", () => {
    assert.equal(resolveQuestionPosition({ question_index: 7 }, new Map(), 0), 7);
  });
});
