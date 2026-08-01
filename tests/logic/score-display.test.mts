// tests/logic/score-display.test.mts
//
// Véronique, 1er août 2026 : "Quand je teste la version Score et que je
// décoche toutes les options, j'ai quand même le pourcentage qui
// apparaît sur le résultat."
//
// Deux réglages (jauge oui/non, pourcentage ou libellé) décidaient de
// l'affichage à trois endroits différents du viewer. La branche "pas de
// jauge" affichait le ratio X / Y ET une ligne de pourcentage, alors que
// le panneau de l'éditeur promet "à la place du simple texte X / Y". Et
// aucun réglage ne permettait de retirer le score : le sélecteur était
// caché tant qu'on n'avait ni jauge ni axes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  resolveScoreDisplay,
  resolveAxisScoreDisplay,
  scoreDisplayMode,
} from "../../lib/quizScoring.ts";

describe("Véronique : je décoche tout, le pourcentage reste", () => {
  test("sans jauge : le ratio X / Y, et RIEN d'autre", () => {
    const d = resolveScoreDisplay("percent", false);
    assert.equal(d.kind, "ratio", "surtout pas une jauge, surtout pas un %");
  });

  test("sans jauge et sans réglage enregistré : idem", () => {
    assert.equal(resolveScoreDisplay(null, null).kind, "ratio");
    assert.equal(resolveScoreDisplay(undefined, undefined).kind, "ratio");
  });

  test("'ne pas afficher' retire vraiment le score, jauge cochée ou non", () => {
    assert.equal(resolveScoreDisplay("hidden", false).kind, "none");
    assert.equal(resolveScoreDisplay("hidden", true).kind, "none", "la jauge ne rattrape pas le réglage");
  });

  test("'ne pas afficher' vaut aussi pour les barres par axe", () => {
    assert.equal(resolveAxisScoreDisplay("hidden").kind, "none");
  });
});

describe("Ce qui marchait continue de marcher", () => {
  test("jauge + pourcentage", () => {
    assert.deepEqual(resolveScoreDisplay("percent", true), { kind: "gauge", asLabel: false });
  });

  test("jauge + libellé", () => {
    assert.deepEqual(resolveScoreDisplay("label", true), { kind: "gauge", asLabel: true });
  });

  test("barres par axe : chiffre ou libellé selon le réglage", () => {
    assert.deepEqual(resolveAxisScoreDisplay("percent"), { kind: "value", asLabel: false });
    assert.deepEqual(resolveAxisScoreDisplay("label"), { kind: "value", asLabel: true });
  });
});

describe("Normalisation de quizzes.score_display_mode", () => {
  test("les trois valeurs connues passent telles quelles", () => {
    for (const v of ["percent", "label", "hidden"] as const) {
      assert.equal(scoreDisplayMode(v), v);
    }
  });

  test("tout le reste retombe sur le comportement historique", () => {
    // Un quiz créé avant la feature a la colonne à null : il doit
    // continuer d'afficher son score, jamais disparaître en silence.
    assert.equal(scoreDisplayMode(null), "percent");
    assert.equal(scoreDisplayMode(undefined), "percent");
    assert.equal(scoreDisplayMode("HIDDEN"), "percent");
    assert.equal(scoreDisplayMode("nimporte quoi"), "percent");
  });
});
