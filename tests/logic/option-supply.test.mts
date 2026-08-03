// tests/logic/option-supply.test.mts
//
// Véronique, escaladée par le coach le 3 août 2026 : "comme il n'y a que
// 3 réponses possibles par question et 4 résultats, forcément ça
// déconne."
//
// Ce que ce test fige : on SAIT nommer ce cas, et on ne le confond ni
// avec un quiz scoré, ni avec une question qui n'a légitimement pas
// autant de réponses (oui/non, texte libre, échelle).

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeOptionSupply, missingOptionCount } from "../../lib/quizCoherence.ts";

const choice = (n: number) =>
  ({ options: Array.from({ length: n }, (_u, i) => ({ result_index: i })) });

test("le cas de Véronique est détecté : 3 réponses pour 4 profils", () => {
  const supply = analyzeOptionSupply("profiles", [choice(3), choice(3), choice(3)], 4);
  assert.equal(supply.short, true);
  assert.deepEqual(supply.shortQuestions, [0, 1, 2]);
  assert.equal(supply.minOptions, 3);
  assert.equal(supply.resultCount, 4);
});

test("autant de réponses que de profils : rien à signaler", () => {
  const supply = analyzeOptionSupply("profiles", [choice(4), choice(5)], 4);
  assert.equal(supply.short, false);
  assert.deepEqual(supply.shortQuestions, []);
});

test("en mode score, la question ne se pose pas", () => {
  // Le résultat vient de la tranche de points, pas du result_index.
  // Signaler un manque de réponses ici, c'est refaire le drame du
  // 1er août : une alerte rouge sur un quiz qui marche.
  const supply = analyzeOptionSupply("scoring", [choice(2), choice(3)], 5);
  assert.equal(supply.short, false);
});

test("oui/non n'est jamais en manque : c'est le principe du type", () => {
  const yesNo = { options: [{ result_index: 0 }, { result_index: 1 }], question_type: "yes_no" };
  const supply = analyzeOptionSupply("profiles", [yesNo], 4);
  assert.equal(supply.short, false);
});

test("texte libre, échelle et étoiles n'ont pas d'options : on les ignore", () => {
  // Retour Jocelyne, 1er août : les compter les ferait apparaître comme
  // un défaut alors qu'elles n'ont simplement pas d'options.
  const noOptions = [
    { options: [], question_type: "free_text" },
    { options: [], question_type: "rating_scale" },
    { options: [], question_type: "star_rating" },
  ];
  assert.equal(analyzeOptionSupply("profiles", noOptions, 4).short, false);
});

test("un seul profil (ou zéro) : il n'y a rien à couvrir", () => {
  assert.equal(analyzeOptionSupply("profiles", [choice(1)], 1).short, false);
  assert.equal(analyzeOptionSupply("profiles", [choice(1)], 0).short, false);
});

test("seules les questions en manque sont listées", () => {
  const supply = analyzeOptionSupply("profiles", [choice(4), choice(2), choice(5), choice(3)], 4);
  assert.deepEqual(supply.shortQuestions, [1, 3]);
  assert.equal(supply.minOptions, 2);
});

test("on n'ajoute jamais plus de réponses qu'il n'en manque", () => {
  assert.equal(missingOptionCount(3, 4), 1);
  assert.equal(missingOptionCount(4, 4), 0);
  assert.equal(missingOptionCount(6, 4), 0);
  assert.equal(missingOptionCount(0, 4), 4);
  // Une entrée absurde ne doit pas produire un nombre négatif de
  // réponses à créer.
  assert.equal(missingOptionCount(-2, 4), 4);
});
