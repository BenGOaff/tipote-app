// tests/logic/scoring-result.test.mts
//
// Véronique, 2 août 2026 : "je ne comprends pas la manière de scorer.
// C'est dommage pour un quiz."
//
// En cherchant, j'ai trouvé pire que de l'incompréhension. Le viewer
// faisait `ranges.find(...) ?? null` : un score qui tombe entre deux
// tranches, ou un quiz dont aucun résultat n'a de tranche, et le
// visiteur répondait à tout, laissait son email, et arrivait sur une
// page SANS titre, SANS texte, SANS bouton. Silencieusement.
//
// Règle testée ici : dès qu'il existe un résultat, il y a un résultat
// affiché. Toujours. Quelle que soit la configuration.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { pickScoringResultIndex, splitRangeIntoTranches } from "../../lib/quizScoring.ts";

const R = (min: number | null, max: number | null) => ({ min_score: min, max_score: max });

describe("Un visiteur voit TOUJOURS un résultat", () => {
  const tranches = [R(0, 5), R(6, 10), R(11, 15)];

  test("cas nominal : la tranche qui contient le score", () => {
    assert.equal(pickScoringResultIndex(tranches, 0), 0);
    assert.equal(pickScoringResultIndex(tranches, 5), 0);
    assert.equal(pickScoringResultIndex(tranches, 6), 1);
    assert.equal(pickScoringResultIndex(tranches, 15), 2);
  });

  test("LE BUG : un trou entre deux tranches ne donne plus une page vide", () => {
    // 6 et 7 ne sont couverts par personne : avant, écran blanc.
    const troue = [R(0, 5), R(8, 12)];
    assert.equal(pickScoringResultIndex(troue, 6), 0, "6 est plus proche du bas");
    assert.equal(pickScoringResultIndex(troue, 7), 1, "7 est plus proche du haut");
  });

  test("un score au dessus de tout tombe sur la tranche la plus haute", () => {
    assert.equal(pickScoringResultIndex(tranches, 99), 2);
  });

  test("un score en dessous de tout tombe sur la tranche la plus basse", () => {
    assert.equal(pickScoringResultIndex(tranches, -20), 0);
  });

  test("aucune tranche renseignée : le premier résultat, pas le vide", () => {
    // Le cas le plus frequent chez une debutante : elle a cree ses
    // resultats et pas encore touche aux bornes.
    assert.equal(pickScoringResultIndex([R(null, null), R(null, null)], 7), 0);
  });

  test("bornes partielles : elles restent respectées", () => {
    const ouvert = [R(null, 5), R(6, null)];
    assert.equal(pickScoringResultIndex(ouvert, -100), 0);
    assert.equal(pickScoringResultIndex(ouvert, 3), 0);
    assert.equal(pickScoringResultIndex(ouvert, 1000), 1);
  });

  test("des tranches en désordre dans la liste marchent quand même", () => {
    const desordre = [R(11, 15), R(0, 5), R(6, 10)];
    assert.equal(pickScoringResultIndex(desordre, 7), 2);
    assert.equal(pickScoringResultIndex(desordre, 12), 0);
  });

  test("chevauchement : la tranche la plus basse gagne, comme annoncé", () => {
    // L'editeur previent du chevauchement ; le viewer doit rester
    // predictible, et dire la meme chose que l'avertissement.
    const chevauche = [R(0, 10), R(5, 15)];
    assert.equal(pickScoringResultIndex(chevauche, 7), 0);
  });

  test("un seul résultat : c'est lui, quoi qu'il arrive", () => {
    assert.equal(pickScoringResultIndex([R(50, 60)], 0), 0);
    assert.equal(pickScoringResultIndex([R(50, 60)], 1000), 0);
  });

  test("aucun résultat : il n'y a rien à afficher, on le dit", () => {
    assert.equal(pickScoringResultIndex([], 5), -1);
  });
});

describe("Répartir les tranches : le calcul que la créatrice ne doit pas faire", () => {
  test("3 profils sur 0 à 11 : contigu, sans trou ni chevauchement", () => {
    const t = splitRangeIntoTranches({ min: 0, max: 11 }, 3);
    assert.deepEqual(t, [
      { min_score: 0, max_score: 3 },
      { min_score: 4, max_score: 7 },
      { min_score: 8, max_score: 11 },
    ]);
  });

  test("le reliquat va vers le haut : le meilleur profil est un peu plus dur", () => {
    const t = splitRangeIntoTranches({ min: 0, max: 9 }, 3);
    assert.deepEqual(t.map((x) => x.max_score - x.min_score + 1), [3, 3, 4]);
  });

  test("quelle que soit la plage, les tranches se touchent sans se recouvrir", () => {
    for (const max of [1, 5, 7, 12, 20, 37, 100]) {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const t = splitRangeIntoTranches({ min: 0, max }, n);
        assert.equal(t.length, n, `${max}/${n}`);
        assert.equal(t[0].min_score, 0, `${max}/${n} depart`);
        assert.equal(t[t.length - 1].max_score, max, `${max}/${n} arrivee`);
        for (let i = 1; i < t.length; i++) {
          assert.ok(t[i].min_score <= t[i - 1].max_score + 1, `${max}/${n} trou en ${i}`);
          assert.ok(t[i].min_score > t[i - 1].max_score || max < n, `${max}/${n} chevauchement en ${i}`);
        }
      }
    }
  });

  test("plus de profils que de points possibles : on ne plante pas", () => {
    const t = splitRangeIntoTranches({ min: 0, max: 1 }, 4);
    assert.equal(t.length, 4);
    assert.ok(t.every((x) => x.max_score >= x.min_score));
  });

  test("aucun profil : rien à répartir", () => {
    assert.deepEqual(splitRangeIntoTranches({ min: 0, max: 10 }, 0), []);
  });
});
