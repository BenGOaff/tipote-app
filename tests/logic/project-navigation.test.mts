// tests/logic/project-navigation.test.mts
//
// Gwenn, 1er août 2026 : "Je clique sur les stats depuis Mes projets. La
// flèche des stats me ramène sur le quiz. La flèche du quiz me ramène
// sur les stats. Et je tourne en boucle entre les deux, sans pouvoir en
// sortir."
//
// Le test ne vérifie pas seulement les destinations : il REMONTE de
// parent en parent depuis chaque écran et exige que ça s'arrête. C'est
// le seul contrôle qui restera vrai quand un nouvel écran s'ajoutera.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  PROJECT_LIST_PATH,
  projectBackHref,
  type ProjectScreen,
} from "../../lib/nav/projectBack.ts";

const SCREENS: ProjectScreen[] = ["quizEditor", "surveyEditor", "analytics"];

/** Chemin d'un écran, pour repérer un parent qui redescendrait. */
const PATH_OF: Record<ProjectScreen, string> = {
  quizEditor: "/quiz/123",
  surveyEditor: "/quiz/123",
  analytics: "/quiz/123/analytics",
};

describe("Gwenn : sortir de la boucle stats <-> éditeur", () => {
  test("la flèche des stats ne renvoie PAS vers l'éditeur", () => {
    assert.notEqual(projectBackHref("analytics"), PATH_OF.quizEditor);
  });

  test("la flèche de l'éditeur ne renvoie PAS vers les stats", () => {
    assert.notEqual(projectBackHref("quizEditor"), PATH_OF.analytics);
  });

  test("tout écran de projet remonte à Mes projets", () => {
    for (const s of SCREENS) {
      assert.equal(projectBackHref(s), PROJECT_LIST_PATH, s);
    }
  });

  test("remonter finit TOUJOURS par sortir, en un nombre fini d'étapes", () => {
    for (const start of SCREENS) {
      const seen = new Set<string>([PATH_OF[start]]);
      let here = projectBackHref(start);
      let hops = 0;
      // Tant que la destination est encore un écran de projet, on
      // continue de remonter. Une paire d'écrans qui se citent l'un
      // l'autre ferait boucler ici : c'est exactement ce que Gwenn a vécu.
      while (hops < 10) {
        assert.ok(!seen.has(here), `boucle depuis ${start} : on repasse par ${here}`);
        seen.add(here);
        const next = SCREENS.find((s) => PATH_OF[s] === here);
        if (!next) break;
        here = projectBackHref(next);
        hops += 1;
      }
      assert.equal(here, PROJECT_LIST_PATH, `depuis ${start}, on doit atterrir sur la liste`);
    }
  });

  test("la destination ne dépend pas du chemin parcouru", () => {
    // Même écran, deux appels : même réponse. Un retour basé sur
    // l'historique (router.back) violait ça, et c'est ce qui rendait le
    // cycle possible.
    assert.equal(projectBackHref("analytics"), projectBackHref("analytics"));
  });
});
