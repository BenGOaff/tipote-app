// tests/logic/full-funnel.test.mts
//
// Audit du quiz de Jocelyne, 4 août 2026. Ses vrais chiffres :
//
//     142 arrivent -> ~66 commencent -> 55 terminent -> 55 laissent leur
//                                                       email
//
// Elle perdait la moitié de ses visiteurs AVANT la première question, et
// huit fois moins sur l'ensemble de ses huit questions. La carte funnel
// commençait à la question 1 : on lui montrait 14% de son problème, et
// c'est là qu'elle a cherché pendant trois semaines.
//
// Ce fichier fige le cadrage : la fuite se voit où qu'elle soit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  biggestLeak,
  buildFullFunnel,
  renderFullFunnelVerdict,
} from "../../lib/quiz/fullFunnel.ts";
import type { FunnelStepLike } from "../../lib/quiz/funnelSignal.ts";

const q = (...views: number[]): FunnelStepLike[] =>
  views.map((v, i) => ({ questionIndex: i, views: v, hasData: true }));

/** Le quiz de Jocelyne, à la virgule près. */
const jocelyne = () =>
  buildFullFunnel({
    views: 142,
    starts: 69,
    questions: q(64, 63, 62, 61, 58, 57, 56, 55),
    leads: 55,
    viewsReliable: true,
  });

// ── Le cas qui a motivé le module ────────────────────────────────────

test("la vraie fuite de Jocelyne est enfin dans l'image", () => {
  const steps = jocelyne();
  assert.equal(steps[0]!.stage, "arrival");
  assert.equal(steps[0]!.people, 142);
  assert.equal(steps[0]!.lost, 73, "73 personnes n'ont jamais cliqué sur commencer");
  assert.ok(steps[0]!.notable);
});

test("et c'est elle qu'on désigne, pas une question", () => {
  const leak = biggestLeak(jocelyne());
  assert.equal(leak?.stage, "arrival");
  assert.equal(leak?.lost, 73);
});

test("aucune de ses huit questions n'est signalée", () => {
  // Elles perdent 1 à 3 personnes : sous les seuils, comme il se doit.
  for (const s of jocelyne().filter((x) => x.stage === "question")) {
    assert.equal(s.notable, false, `Q${(s.questionIndex ?? 0) + 1} ne doit rien déclencher`);
  }
});

test("son écran de capture est excellent, et ça se voit", () => {
  const last = jocelyne().filter((s) => s.stage === "question").at(-1)!;
  assert.equal(last.lost, 0, "55 terminent, 55 laissent leur email");
});

// ── Le nombre de personnes décide, pas le pourcentage ────────────────

test("le nombre de personnes décide, pas le pourcentage", () => {
  // Arrivée : 200 -> 120, soit 80 personnes et 40%.
  // Capture : 114 -> 60, soit 54 personnes et 47%.
  // Le pourcentage désignerait la capture. C'est l'arrivée qu'il faut
  // corriger : elle coûte 26 personnes de plus.
  const steps = buildFullFunnel({
    views: 200,
    starts: 120,
    questions: q(120, 118, 116, 114),
    leads: 60,
    viewsReliable: true,
  });
  const capture = steps.at(-2)!;
  assert.ok(capture.lostPct! > 40, "la capture perd bien un plus gros pourcentage");
  assert.equal(biggestLeak(steps)?.stage, "arrival");
  assert.equal(biggestLeak(steps)?.lost, 80);
});

// ── Ce qu'on refuse d'inventer ───────────────────────────────────────

test("des vues non fiables ne produisent pas une fausse fuite d'entrée", () => {
  // Quiz antérieur au tracking, ou embarqué : moins de vues que de leads.
  // Afficher "tu perds tout le monde à l'entrée" serait un mensonge.
  const steps = buildFullFunnel({
    views: 3,
    starts: 0,
    questions: q(40, 38),
    leads: 36,
    viewsReliable: false,
  });
  assert.equal(steps[0]!.stage, "question");
  assert.ok(!steps.some((s) => s.stage === "arrival"));
});

test("une étape sans donnée est absente, jamais à zéro", () => {
  const steps = buildFullFunnel({
    views: 0,
    starts: 0,
    questions: [
      { questionIndex: 0, views: 50, hasData: true },
      { questionIndex: 1, views: 0, hasData: false },
      { questionIndex: 2, views: 48, hasData: true },
    ],
    leads: 40,
    viewsReliable: true,
  });
  assert.deepEqual(
    steps.map((s) => s.stage),
    ["question", "question", "capture"],
  );
});

test("une remontée ne devient pas une perte négative", () => {
  // Deux compteurs qui n'ont pas la même histoire : on ne bricole pas.
  const steps = buildFullFunnel({
    views: 50,
    starts: 60,
    questions: q(58),
    leads: 55,
    viewsReliable: true,
  });
  assert.equal(steps[0]!.lost, 0);
  assert.equal(steps[0]!.notable, false);
});

test("une fuite lue sur une poignée de gens n'est pas signalée", () => {
  const steps = buildFullFunnel({
    views: 12,
    starts: 6,
    questions: q(6, 5),
    leads: 4,
    viewsReliable: true,
  });
  assert.equal(biggestLeak(steps), null, "50% de perte, mais sur 12 personnes");
});

test("un quiz sans rien ne raconte rien", () => {
  const steps = buildFullFunnel({
    views: 0,
    starts: 0,
    questions: [],
    leads: 0,
    viewsReliable: false,
  });
  assert.deepEqual(steps, []);
  assert.equal(biggestLeak(steps), null);
});

// ── Ce que nos IA reçoivent ──────────────────────────────────────────
//
// Le rapport du 3 août a envoyé Jocelyne travailler sa question 7. Le
// modèle ne pouvait pas faire mieux : on lui donnait un tableau qui
// commençait à la question 1. Ces tests figent ce qu'il reçoit
// désormais, parce qu'un prompt régresse en silence.

test("le verdict envoyé à l'IA nomme l'écran d'accueil, pas une question", () => {
  const verdict = renderFullFunnelVerdict(jocelyne());
  assert.match(verdict, /ECRAN D'ACCUEIL/);
  assert.match(verdict, /73 personnes perdues sur 142/);
  assert.ok(
    !/LA QUESTION \d/.test(verdict),
    "aucune de ses questions ne doit être désignée comme la fuite",
  );
});

test("et il lui interdit de proposer de retoucher une question", () => {
  const verdict = renderFullFunnelVerdict(jocelyne());
  assert.match(verdict, /ne se corrige PAS dans les questions/);
  assert.match(verdict, /non negociable/);
});

test("le parcours entier est écrit, marche par marche", () => {
  const verdict = renderFullFunnelVerdict(jocelyne());
  assert.match(verdict, /Arrivent sur le quiz : 142/);
  assert.match(verdict, /Cliquent sur commencer : 69/);
  assert.match(verdict, /Q1 : 64/);
  assert.match(verdict, /Laissent leur email : 55/);
});

test("un gros pourcentage de fin ne vole pas la priorité", () => {
  // Le même cas que plus haut : la capture perd un plus gros
  // pourcentage, l'accueil perd plus de monde. C'est l'accueil qui doit
  // sortir, sinon on renvoie la créatrice peaufiner un écran vu par
  // deux fois moins de gens.
  const verdict = renderFullFunnelVerdict(
    buildFullFunnel({
      views: 200,
      starts: 120,
      questions: q(120, 118, 116, 114),
      leads: 60,
      viewsReliable: true,
    }),
  );
  assert.match(verdict, /ECRAN D'ACCUEIL/);
  assert.ok(!/ECRAN DE CAPTURE/.test(verdict));
});

test("sans fuite nette, on interdit explicitement d'en inventer une", () => {
  const verdict = renderFullFunnelVerdict(
    buildFullFunnel({
      views: 12,
      starts: 6,
      questions: q(6, 5),
      leads: 4,
      viewsReliable: true,
    }),
  );
  assert.match(verdict, /Ne fabrique pas un point de fuite/);
});

test("un quiz sans donnée ne produit aucun bloc", () => {
  assert.equal(renderFullFunnelVerdict([]), "");
});

test("l'analyse IA passe bien le parcours entier au modèle", () => {
  // Le garde-fou structurel : si quelqu'un retire cet appel, le rapport
  // repart sur le seul funnel par question, donc sur 14% du problème.
  const src = readFileSync(new URL("../../lib/quiz/insights.ts", import.meta.url), "utf8");
  assert.ok(/renderFullFunnelVerdict\(/.test(src), "le prompt doit recevoir le parcours complet");
  assert.ok(/buildFullFunnel\(/.test(src), "l'agrégat doit construire le parcours complet");
});
