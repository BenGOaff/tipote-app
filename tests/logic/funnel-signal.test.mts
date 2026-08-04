// tests/logic/funnel-signal.test.mts
//
// Jocelyne, 4 août 2026 : "j'ai tout changé sur les conseils du robot,
// j'attendais trois quatre nouvelles personnes, même problème, toujours
// la question 7. Il m'a conseillé de l'enlever, je l'ai enlevée, et ça
// continue à bloquer au même endroit."
//
// Puis, le lendemain : "mon premier quiz a 15 questions et globalement
// tous les gens qui le commencent le terminent." Ce n'était donc pas la
// longueur.
//
// Ce fichier fige les trois corrections, et la première est la plus
// importante : on désignait la question SUIVANTE, celle que les partants
// n'avaient jamais vue. Elle a réécrit, réordonné puis supprimé un texte
// que personne ne lisait.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_SAMPLE,
  readFunnelSignal,
  stepLoss,
  type FunnelStepLike,
} from "../../lib/quiz/funnelSignal.ts";

/** Funnel décrit par ses effectifs successifs (pas de donnée de réponses). */
const funnel = (...views: number[]): FunnelStepLike[] =>
  views.map((v, i) => ({ questionIndex: i, views: v, hasData: true }));

/** Funnel avec le détail vues / réponses, par paires. */
const detailed = (...pairs: [number, number][]): FunnelStepLike[] =>
  pairs.map(([views, answers], i) => ({ questionIndex: i, views, answers, hasData: true }));

// ── 1. La question désignée est celle qu'ils ont VUE ─────────────────

test("on nomme la question sur laquelle ils s'arrêtent, pas la suivante", () => {
  // 100 personnes voient la Q3 (index 2), 40 seulement voient la Q4.
  // Les 60 partants ont vu la Q3 et JAMAIS la Q4 : c'est la Q3 qu'il
  // faut regarder. L'ancien bandeau annonçait la Q4.
  const s = readFunnelSignal(funnel(120, 110, 100, 40, 38));
  assert.equal(s.kind, "hotspot");
  assert.equal(s.hotspot?.questionIndex, 2, "la dernière question VUE");
  assert.equal(s.hotspot?.neverReachedIndex, 3, "celle qu'ils n'ont jamais atteinte");
  assert.equal(s.hotspot?.lost, 60);
  assert.equal(s.hotspot?.sample, 100);
});

test("supprimer la question désignée ne pouvait rien changer", () => {
  // Le scénario de Jocelyne, en deux temps. Les gens s'arrêtent sur la
  // question d'index 5. On lui désignait l'index 6 ; elle l'a supprimée ;
  // le funnel restant a la MÊME chute, au MÊME endroit.
  const avant = readFunnelSignal(funnel(60, 58, 56, 54, 52, 50, 20, 19, 18));
  assert.equal(avant.hotspot?.questionIndex, 5);

  // Après suppression de l'ancienne Q7 (index 6) : la chute n'a pas
  // bougé, parce que sa cause n'a jamais été touchée.
  const apres = readFunnelSignal(funnel(60, 58, 56, 54, 52, 50, 19, 18));
  assert.equal(apres.hotspot?.questionIndex, 5, "toujours la même, et c'est normal");
});

// ── 2. Le seuil d'échantillon ────────────────────────────────────────

test("une chute lue sur une poignée de personnes n'en est pas une", () => {
  // Son ordre de grandeur du premier jour. À l'ancienne règle (15% sans
  // seuil), le bandeau rouge sortait pour DEUX personnes.
  const s = readFunnelSignal(funnel(12, 11, 10, 10, 9, 8, 6, 5));
  assert.equal(s.kind, "too-few");
  assert.equal(s.hotspot, null);
  assert.equal(s.bestSample, 12);
  assert.equal(s.needed, MIN_SAMPLE);
});

test("une personne qui part tard ne vaut plus une alerte", () => {
  // 6 visiteurs restants, un part : 16,7%, donc au dessus du seuil de
  // 15%. C'est la dérive vers la fin du quiz : le pourcentage grossit
  // quand l'effectif fond. Le point chaud reste sur la vraie fuite.
  const s = readFunnelSignal(funnel(200, 150, 100, 60, 20, 6, 5));
  assert.equal(s.kind, "hotspot");
  assert.notEqual(s.hotspot?.questionIndex, 5, "pas la queue de funnel");
});

test("entre deux chutes réelles, on montre la plus forte", () => {
  const s = readFunnelSignal(funnel(200, 150, 100, 95, 90));
  assert.equal(s.hotspot?.questionIndex, 1, "150 -> 100 perd plus que 200 -> 150");
});

test("elle sait jusqu'où la lecture tient debout", () => {
  // Beaucoup de monde au début, presque personne à la fin. C'est la
  // réponse honnête à "pourquoi tu ne me dis rien sur ma question 7".
  const s = readFunnelSignal(funnel(120, 100, 80, 40, 15, 12, 8));
  assert.equal(s.readableUntil, 3, "au delà de l'index 3, moins de 20 visiteurs");
});

// ── 3. La forme de la chute, qu'on avait sans jamais la montrer ──────

test("vue sans réponse : la question bloque", () => {
  // 100 la voient, 45 seulement y répondent. Ils butent SUR elle :
  // trop intime, incomprise, ou blocage technique.
  const s = readFunnelSignal(detailed([120, 118], [100, 45], [44, 44]));
  assert.equal(s.hotspot?.questionIndex, 1);
  assert.equal(s.hotspot?.shape, "on-question");
  assert.equal(s.hotspot?.stuck, 55);
});

test("répondue puis abandon : c'est de la fatigue, pas la question", () => {
  // 100 la voient, 98 y répondent, et 40 seulement arrivent à la
  // suivante. Reformuler cette question ne servirait à rien.
  const s = readFunnelSignal(detailed([120, 118], [100, 98], [40, 40]));
  assert.equal(s.hotspot?.questionIndex, 1);
  assert.equal(s.hotspot?.shape, "after-answer");
  assert.equal(s.hotspot?.leftAfter, 58);
});

test("sans donnée de réponses, on ne devine pas", () => {
  const s = readFunnelSignal(funnel(120, 100, 40));
  assert.equal(s.hotspot?.shape, "unknown");
});

// ── Les verdicts qui ne sont pas des alertes ─────────────────────────

test("un quiz qui tient la route reçoit un verdict positif", () => {
  // C'est le cas de son quiz à 15 questions : assez de monde, aucune
  // chute anormale. Elle a le droit de savoir que tout va bien.
  const s = readFunnelSignal(funnel(120, 118, 115, 112, 110));
  assert.equal(s.kind, "steady");
  assert.equal(s.hotspot, null);
});

test("un quiz sans aucune donnée ne raconte rien", () => {
  assert.equal(readFunnelSignal([]).kind, "no-data");
  assert.equal(
    readFunnelSignal([{ questionIndex: 0, views: 0, hasData: false }]).kind,
    "no-data",
  );
});

test("une question ajoutée après coup ne casse pas la chaîne", () => {
  // Règle Adeline : une étape sans event est exclue du calcul, sinon
  // elle simule une chute de 100% puis une remontée.
  const steps: FunnelStepLike[] = [
    { questionIndex: 0, views: 200, hasData: true },
    { questionIndex: 1, views: 0, hasData: false },
    { questionIndex: 2, views: 190, hasData: true },
  ];
  assert.equal(readFunnelSignal(steps).kind, "steady");
});

// ── La perte affichée ligne à ligne ──────────────────────────────────

test("la perte est portée par la question qui perd, avec des personnes", () => {
  // "-25%" seul laisse croire à une tendance, "-25% (2 personnes)" se
  // comprend tout seul. Et la ligne qui porte la perte est la PREMIÈRE
  // des deux, celle qu'ils ont vue.
  assert.deepEqual(stepLoss(funnel(8, 6), 0), { pct: 25, lost: 2, sample: 8 });
  assert.equal(stepLoss(funnel(8, 6), 1), null, "la dernière ne perd personne");
});

test("pas de perte, pas de ligne", () => {
  assert.equal(stepLoss(funnel(50, 50), 0), null, "aucun départ");
  assert.equal(stepLoss(funnel(50, 60), 0), null, "remontée : rien à dire");
  assert.equal(stepLoss(funnel(50, 40), 5), null, "hors bornes");
});
