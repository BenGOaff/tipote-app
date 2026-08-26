// tests/logic/analyse-reponses.test.mts
//
// Ce que l'IA lit des réponses : échelles, réponses libres, choix
// multiples. Le format et les règles de lecture vivent dans
// lib/survey/renderQuestions.ts, appelé par l'analyse de sondage ET par
// l'analyse stratégique du quiz.
//
// Ce que ces tests protègent, dans l'ordre de gravité :
// 1. une moyenne sortait SANS son échelle (4,2 sur 5 = excellent,
//    4,2 sur 10 = mauvais, et la ligne était la même) ;
// 2. les libellés des bornes n'arrivaient jamais, donc sur une échelle de
//    fatigue l'IA félicitait la créatrice pour une note haute ;
// 3. la moyenne partait seule, donc une audience coupée en deux se lisait
//    comme une audience tiède ;
// 4. une question à choix multiples était lue comme des parts d'un tout ;
// 5. l'échantillon de réponses libres était les PREMIERS arrivés, donc
//    l'audience du jour du lancement.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANSWER_READING_RULES,
  echantillonReparti,
  estMultiSelect,
  nomDuType,
  renderQuestionsForPrompt,
  resoudreEchelle,
  type QuestionPourPrompt,
} from "@/lib/survey/renderQuestions";

const base = (over: Partial<QuestionPourPrompt> = {}): QuestionPourPrompt => ({
  index: 0,
  text: "Une question",
  type: "multiple_choice",
  options: [],
  answeredCount: 10,
  ...over,
});

// ── 1. Les bornes sont celles du VIEWER, pas des valeurs inventées ──

test("l'échelle par défaut est 0 à 10, les étoiles 1 à 5 (comme le viewer)", () => {
  assert.deepEqual(resoudreEchelle("rating_scale", null), {
    min: 0,
    max: 10,
    minLabel: null,
    maxLabel: null,
  });
  assert.deepEqual(resoudreEchelle("star_rating", null), {
    min: 1,
    max: 5,
    minLabel: null,
    maxLabel: null,
  });
  assert.equal(resoudreEchelle("star_rating", { max: 7 })?.max, 7);
  assert.equal(resoudreEchelle("rating_scale", { min: 1, max: 5 })?.min, 1);
});

test("une question sans échelle n'en reçoit pas une par accident", () => {
  for (const t of ["multiple_choice", "free_text", "yes_no", "image_choice"]) {
    assert.equal(resoudreEchelle(t, { min: 0, max: 10 }), null, t);
  }
});

// ── 2. La moyenne ne sort JAMAIS sans son échelle ──

test("la moyenne est toujours suivie de son échelle", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        text: "Ton niveau de fatigue ?",
        type: "rating_scale",
        average: 4.2,
        echelle: { min: 0, max: 10, minLabel: null, maxLabel: null },
        notes: [{ valeur: 4, count: 6 }, { valeur: 5, count: 4 }],
      }),
    ],
    10,
  ).join("\n");
  assert.match(rendu, /note moyenne : 4\.2 sur 10/);
  // Le bug d'origine : la moyenne toute seule.
  assert.doesNotMatch(rendu, /note moyenne : 4\.2\s*$/m);
});

test("les libellés des bornes voyagent : ce sont eux qui disent le SENS", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        type: "rating_scale",
        average: 8,
        echelle: { min: 0, max: 10, minLabel: "je pète le feu", maxLabel: "je suis épuisé" },
      }),
    ],
    10,
  ).join("\n");
  assert.match(rendu, /je suis épuisé/);
  assert.match(rendu, /je pète le feu/);
});

// ── 3. La répartition, y compris ses trous ──

test("la répartition garde les valeurs à zéro : c'est le creux qui parle", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        type: "rating_scale",
        average: 5,
        echelle: { min: 0, max: 4, minLabel: null, maxLabel: null },
        notes: [
          { valeur: 0, count: 6 },
          { valeur: 1, count: 0 },
          { valeur: 2, count: 0 },
          { valeur: 3, count: 0 },
          { valeur: 4, count: 6 },
        ],
      }),
    ],
    12,
  ).join("\n");
  assert.match(rendu, /répartition des notes : 0 : 6, 1 : 0, 2 : 0, 3 : 0, 4 : 6/);
});

test("aucune ligne de répartition quand personne n'a noté", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        type: "rating_scale",
        average: null,
        echelle: { min: 0, max: 3, minLabel: null, maxLabel: null },
        notes: [{ valeur: 0, count: 0 }, { valeur: 1, count: 0 }],
      }),
    ],
    10,
  ).join("\n");
  assert.doesNotMatch(rendu, /répartition/);
});

// ── 4. Choix multiples : les % ne sont pas des parts d'un tout ──

test("une question à choix multiples est ANNONCÉE comme telle", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        multiSelect: true,
        options: [
          { text: "A", count: 8, pct: 80 },
          { text: "B", count: 7, pct: 70 },
        ],
      }),
    ],
    10,
  ).join("\n");
  assert.match(rendu, /PLUSIEURS réponses possibles/);
  assert.match(rendu, /au delà de 100/);
});

test("estMultiSelect ne devine rien : il lit le réglage", () => {
  assert.equal(estMultiSelect({ multi_select: true }), true);
  assert.equal(estMultiSelect({ multi_select: "true" }), false);
  assert.equal(estMultiSelect(null), false);
  assert.equal(estMultiSelect({}), false);
});

// ── 5. L'échantillon de réponses libres est RÉPARTI ──

test("l'échantillon prend le début, la fin et le milieu, jamais les N premiers", () => {
  const dix = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const pris = echantillonReparti(dix, 3);
  assert.equal(pris.length, 3);
  assert.equal(pris[0], "a");
  assert.equal(pris[2], "j", "la DERNIÈRE réponse doit être citée");
  assert.notDeepEqual(pris, ["a", "b", "c"], "les 3 premiers = l'audience du lancement");
});

test("échantillonner ne perd rien quand tout tient", () => {
  assert.deepEqual(echantillonReparti(["a", "b"], 5), ["a", "b"]);
  assert.deepEqual(echantillonReparti([], 5), []);
  assert.deepEqual(echantillonReparti(["a", "b"], 0), []);
});

test("le nombre TOTAL de réponses libres est dit, et l'échantillon annoncé", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        type: "free_text",
        textCount: 38,
        textSamples: Array.from({ length: 38 }, (_, i) => `verbatim ${i}`),
      }),
    ],
    40,
    { samples: 5 },
  ).join("\n");
  assert.match(rendu, /38 réponses libres au total/);
  assert.match(rendu, /Échantillon de 5/);
  assert.match(rendu, /"verbatim 0"/);
  assert.match(rendu, /"verbatim 37"/);
});

test("quand tout est cité, on ne parle pas d'échantillon", () => {
  const rendu = renderQuestionsForPrompt(
    [base({ type: "free_text", textCount: 2, textSamples: ["oui", "non"] })],
    2,
  ).join("\n");
  assert.match(rendu, /Les voici toutes/);
  assert.doesNotMatch(rendu, /Échantillon/);
});

// ── 6. Zéro réponse : on le dit, on n'aligne pas des 0% ──

test("une question sans réponse le DIT au lieu d'aligner des options à 0%", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({
        answeredCount: 0,
        options: [
          { text: "A", count: 0, pct: 0 },
          { text: "B", count: 0, pct: 0 },
        ],
      }),
    ],
    30,
  ).join("\n");
  assert.match(rendu, /pas encore de réponse/);
  assert.doesNotMatch(rendu, /- A : 0%/);
});

// ── 7. Le type est nommé, et le format ne part pas en morceaux ──

test("chaque type de question est nommé en clair", () => {
  assert.equal(nomDuType("free_text"), "réponse libre");
  assert.equal(nomDuType("rating_scale"), "échelle");
  assert.equal(nomDuType("star_rating"), "étoiles");
  assert.equal(nomDuType("yes_no"), "oui / non");
  assert.equal(nomDuType(null), "choix");
  // Un type inconnu passe tel quel plutôt que de disparaître.
  assert.equal(nomDuType("nouveau_type"), "nouveau_type");
});

test("rien ne part en `undefined` ni en gabarit non résolu", () => {
  const rendu = renderQuestionsForPrompt(
    [
      base({ type: "free_text", textCount: 3, textSamples: ["x", "y", "z"] }),
      base({
        index: 1,
        type: "star_rating",
        average: 4,
        echelle: { min: 1, max: 5, minLabel: null, maxLabel: null },
        notes: [{ valeur: 4, count: 10 }],
      }),
    ],
    10,
  ).join("\n");
  assert.doesNotMatch(rendu, /\$\{|undefined|NaN|\[object/);
});

// ── 8. Les règles de lecture décrivent CE FORMAT là ──

test("les règles nomment les pièges qui ont produit de mauvais conseils", () => {
  assert.match(ANSWER_READING_RULES, /sur 10/);
  assert.match(ANSWER_READING_RULES, /libellés/);
  assert.match(ANSWER_READING_RULES, /répartition/i);
  assert.match(ANSWER_READING_RULES, /PLUSIEURS réponses possibles/i);
  // Règle maison : aucun tiret cadratin dans ce qu'on montre au modèle.
  assert.doesNotMatch(ANSWER_READING_RULES, /[—–]/);
});

// ── 9. Les deux analyses lisent la MÊME fonction ──

test("l'analyse de sondage et l'analyse de quiz appellent le module partagé", async () => {
  const fs = await import("node:fs/promises");
  for (const f of ["lib/survey/analysis.ts", "lib/quiz/insights.ts"]) {
    const src = await fs.readFile(f, "utf8");
    assert.match(src, /renderQuestionsForPrompt/, f);
    assert.match(src, /ANSWER_READING_RULES/, f);
    // Le format recopié à la main est exactement ce qui a divergé.
    assert.doesNotMatch(src, /note moyenne : \$\{/, `${f} réécrit le format`);
  }
});
