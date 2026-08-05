// tests/logic/start-rate.test.mts
//
// Jocelyne, 5 août 2026. La veille, on avait fini par établir que sa
// vraie fuite était l'écran d'accueil. La phrase qui l'a fait bouger
// n'était pourtant pas celle là :
//
//     "sur ton quiz TDAH, 8 personnes sur 10 commencent le quiz, contre
//      5 sur 10 sur celui-ci."
//
// C'est la différence entre un reproche et une piste : la première dit
// qu'elle a un problème, la seconde prouve qu'il est rattrapable, et
// par elle, puisqu'elle l'a déjà fait une fois.
//
// Aucune de nos IA ne pouvait la produire. Ce fichier fige la règle, et
// surtout ce qu'elle REFUSE de dire : le même écart de 15 points se
// franchit tout seul sur huit visiteurs, et désigner un gagnant sur ce
// bruit là renverrait quelqu'un retravailler une page qui n'a rien.
// C'est exactement le défaut qui lui a coûté trois semaines, dans
// l'autre sens.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_GAP_POINTS,
  compareStartRates,
  renderStartRateVerdict,
  startRateOf,
  type StartRateProject,
} from "../../lib/insights/startRate.ts";
import { MIN_SAMPLE } from "../../lib/quiz/funnelSignal.ts";

const quiz = (
  title: string,
  views: number,
  starts: number,
  over: Partial<StartRateProject> = {},
): StartRateProject => ({
  title,
  mode: "quiz",
  views,
  starts,
  viewsReliable: true,
  ...over,
});

// ── Ce qu'on accepte de lire ─────────────────────────────────────────

test("un quiz avec assez de vues donne son taux", () => {
  assert.deepEqual(startRateOf(quiz("TDAH", 100, 80)), {
    title: "TDAH",
    views: 100,
    starts: 80,
    rate: 80,
  });
});

test("le taux garde une décimale, jamais arrondi à l'avantage de personne", () => {
  assert.equal(startRateOf(quiz("q", 142, 66))?.rate, 46.5);
});

// ── Ce qu'on REFUSE de lire, et c'est le coeur du fichier ────────────

test("sous le seuil d'échantillon, aucun taux", () => {
  // Sur 8 visiteurs, une personne pèse 12 points : l'écart de 15 points
  // se franchirait tout seul, sans que le contenu y soit pour rien.
  assert.equal(startRateOf(quiz("petit", MIN_SAMPLE - 1, 5)), null);
  assert.notEqual(startRateOf(quiz("juste assez", MIN_SAMPLE, 5)), null);
});

test("zéro démarrage n'est pas un taux de 0%", () => {
  // C'est presque toujours du suivi absent (quiz antérieur au tracking).
  // Afficher 0% désignerait comme catastrophique un quiz dont on ne
  // sait rien, et enverrait réécrire une page qui va peut-être très bien.
  assert.equal(startRateOf(quiz("sans suivi", 300, 0)), null);
});

test("plus de démarrages que de vues : on n'invente pas 130%", () => {
  assert.equal(startRateOf(quiz("compteurs desynchro", 100, 130)), null);
});

test("des vues incomplètes ne donnent aucun taux", () => {
  assert.equal(startRateOf(quiz("vues partielles", 100, 50, { viewsReliable: false })), null);
});

test("un sondage n'entre pas dans la comparaison", () => {
  // Son écran d'accueil ne fait pas le même travail : on répond pour
  // aider, pas pour savoir quelque chose sur soi. Le mettre dans le
  // classement désignerait un gagnant qui ne joue pas le même match.
  assert.equal(startRateOf(quiz("sondage", 200, 100, { mode: "survey" })), null);
});

// ── La comparaison ───────────────────────────────────────────────────

test("aucun quiz lisible : on le dit, et on interdit de comparer", () => {
  const c = compareStartRates([quiz("a", 5, 3), quiz("b", 8, 2)]);
  assert.equal(c.kind, "no-data");
  const txt = renderStartRateVerdict(c);
  assert.match(txt, /INTERDIT/);
});

test("un seul quiz lisible : on ne le compare à rien", () => {
  const c = compareStartRates([quiz("seul", 100, 60), quiz("trop petit", 4, 2)]);
  assert.equal(c.kind, "single");
  const txt = renderStartRateVerdict(c);
  // Le piège serait de le comparer à une moyenne que le modèle croit
  // connaître. C'est la faute la plus grave de evidence.ts.
  assert.match(txt, /a RIEN|pas a une moyenne/i);
});

test("des quiz qui se valent ne produisent ni meilleur ni moins bon", () => {
  const c = compareStartRates([quiz("a", 100, 62), quiz("b", 100, 55)]);
  assert.equal(c.kind, "even");
  assert.doesNotMatch(renderStartRateVerdict(c), /ECART NOTABLE/);
});

test("l'écart de Jocelyne est nommé, avec les deux quiz", () => {
  const c = compareStartRates([
    quiz("Découvrez pourquoi vous procrastinez", 142, 66),
    quiz("TDAH", 120, 96),
  ]);
  assert.equal(c.kind, "gap");
  if (c.kind !== "gap") return;
  assert.equal(c.best.title, "TDAH");
  assert.equal(c.worst.title, "Découvrez pourquoi vous procrastinez");
  assert.ok(c.gapPoints >= MIN_GAP_POINTS);

  const txt = renderStartRateVerdict(c, "Découvrez pourquoi vous procrastinez");
  assert.match(txt, /TDAH/);
  assert.match(txt, /Découvrez pourquoi vous procrastinez/);
  // La preuve, pas le classement.
  assert.match(txt, /preuve/i);
  // Et on n'a toujours pas le droit de dire POURQUOI.
  assert.match(txt, /Ce que tu ne sais PAS/);
});

test("le quiz analysé sait qu'il est du mauvais côté de l'écart", () => {
  const c = compareStartRates([quiz("faible", 200, 90), quiz("fort", 200, 170)]);
  const focused = renderStartRateVerdict(c, "faible");
  assert.match(focused, /LE QUIZ ANALYSE ICI/);
  // Le même verdict sans focus ne fabrique pas cette phrase.
  assert.doesNotMatch(renderStartRateVerdict(c), /LE QUIZ ANALYSE ICI/);
});

test("un focus qui est déjà le meilleur ne se fait pas gronder", () => {
  const c = compareStartRates([quiz("faible", 200, 90), quiz("fort", 200, 170)]);
  assert.doesNotMatch(renderStartRateVerdict(c, "fort"), /LE QUIZ ANALYSE ICI/);
});

test("un titre inconnu ne casse rien", () => {
  const c = compareStartRates([quiz("a", 200, 90), quiz("b", 200, 170)]);
  assert.doesNotMatch(renderStartRateVerdict(c, "un quiz supprimé"), /LE QUIZ ANALYSE ICI/);
});

// ── Le classement est stable ─────────────────────────────────────────

test("les taux sortent du meilleur au moins bon", () => {
  const c = compareStartRates([quiz("c", 100, 40), quiz("a", 100, 90), quiz("b", 100, 65)]);
  assert.deepEqual(
    c.rates.map((r) => r.title),
    ["a", "b", "c"],
  );
});
