// tests/logic/other-results.test.mts
//
// Gwenn, 4 août 2026 : "sur la page de résultat, 'Découvre les autres
// profils' est placé au dessus du bouton d'achat. Ça offre une porte de
// sortie juste avant la proposition."
//
// Elle a raison, et c'est net. Le visiteur vient de se reconnaître dans
// son profil : c'est le moment où il est le plus disponible pour ce
// qu'on lui propose. Lui tendre un accordéon de trois autres profils à
// explorer juste avant le bouton, c'est lui donner autre chose à faire
// au moment précis où il fallait qu'il clique.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveOtherResultsPlacement,
  showsOtherResultsAt,
} from "../../lib/quiz/otherResults.ts";

// ── Le nouveau défaut ────────────────────────────────────────────────

test("par défaut, le bloc passe APRÈS le bouton", () => {
  assert.equal(resolveOtherResultsPlacement(true, "after_cta"), "after_cta");
});

test("et ce défaut s'applique aux quiz déjà en ligne", () => {
  // Colonne absente, nulle, ou migration pas encore passée : le nouveau
  // comportement s'applique quand même. C'est la demande de Béné, et
  // c'est aussi ce qui évite un écran cassé si la migration traîne.
  for (const stored of [null, undefined, "", "   ", "n'importe quoi"]) {
    assert.equal(
      resolveOtherResultsPlacement(true, stored),
      "after_cta",
      `${JSON.stringify(stored)} doit donner le nouveau défaut`,
    );
  }
});

test("celle qui préfère l'ancien ordre le récupère", () => {
  assert.equal(resolveOtherResultsPlacement(true, "before_cta"), "before_cta");
});

// ── Décocher gagne toujours ──────────────────────────────────────────

test("décocher retire le bloc, quelle que soit la position", () => {
  // Le cas de Gwenn sur ses campagnes payantes : "peut-être le
  // supprimer, ça dilue l'attention".
  for (const pos of ["after_cta", "before_cta", null, "bidon"]) {
    assert.equal(resolveOtherResultsPlacement(false, pos), "hidden");
  }
  assert.equal(resolveOtherResultsPlacement(null, "after_cta"), "hidden");
  assert.equal(resolveOtherResultsPlacement(undefined, "after_cta"), "hidden");
});

// ── Il ne se rend qu'à UN endroit ────────────────────────────────────

test("le bloc n'apparaît jamais deux fois", () => {
  for (const stored of ["after_cta", "before_cta", null]) {
    const placement = resolveOtherResultsPlacement(true, stored);
    const slots = (["before_cta", "after_cta"] as const).filter((s) =>
      showsOtherResultsAt(placement, s),
    );
    assert.equal(slots.length, 1, `${String(stored)} doit donner exactement un emplacement`);
  }
});

test("masqué, il n'apparaît nulle part", () => {
  const placement = resolveOtherResultsPlacement(false, "after_cta");
  assert.equal(showsOtherResultsAt(placement, "before_cta"), false);
  assert.equal(showsOtherResultsAt(placement, "after_cta"), false);
});

// ── Les garde-fous structurels ───────────────────────────────────────

test("le viewer écrit le bloc UNE fois et le rend aux deux endroits", () => {
  // Le dupliquer, c'est la garantie qu'une correction future n'en
  // touchera qu'un seul.
  const src = readFileSync(new URL("../../components/quiz/PublicQuizClient.tsx", import.meta.url), "utf8");
  assert.equal(
    (src.match(/function renderOtherResults\(/g) ?? []).length,
    1,
    "un seul endroit où le bloc est écrit",
  );
  assert.equal(
    (src.match(/renderOtherResults\(\)/g) ?? []).length,
    3,
    "sa définition, plus un appel par emplacement",
  );
  assert.ok(
    !/\{quiz\.show_other_results && \(\(\) => \{/.test(src),
    "l'ancienne condition, qui ignorait la position, ne doit pas revenir",
  );
});

test("la colonne survit à une migration en retard", () => {
  // La route publique la lit dans le groupe des colonnes récentes, qui
  // a déjà un repli. Sans ça, une migration non appliquée ferait
  // échouer TOUTE la requête, donc plus aucun quiz public (c'est
  // exactement le drame du 2 juin 2026).
  const src = readFileSync(
    new URL("../../app/api/quiz/[quizId]/public/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(/QUIZ_COLS_NEW = "[^"]*other_results_position/.test(src));
});

test("le réglage est enregistrable", () => {
  const src = readFileSync(new URL("../../app/api/quiz/[quizId]/route.ts", import.meta.url), "utf8");
  assert.ok(/"other_results_position"/.test(src), "sinon le PATCH jette la valeur en silence");
});
