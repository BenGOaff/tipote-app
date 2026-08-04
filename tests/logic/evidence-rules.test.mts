// tests/logic/evidence-rules.test.mts
//
// Le fil rouge du 4 août 2026 : dire ce qu'on sait, dire ce qu'on
// suppose, et ne jamais confondre les deux.
//
// Le rapport IA du 3 août disait à Jocelyne : "Retravailler la question
// 7, 6% de perte". Écrit comme un constat. C'était un artefact de
// calcul sur trois visiteurs, et la question désignée n'était même pas
// celle où les gens s'arrêtaient. Trois semaines de travail pour rien.
//
// Le même jour, en cherchant la cause, j'ai affirmé à Béné que le titre
// de Jocelyne était trop long, puis que son bouton passait sous la
// ligne de flottaison. Deux hypothèses présentées comme des
// conclusions, toutes les deux fausses, et c'est elle qui a dû aller
// vérifier.
//
// Ce n'est donc pas un défaut de modèle : c'est ce qui arrive dès qu'on
// écrit une cause au présent de l'indicatif.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EVIDENCE_RULES, NO_DATA_RULES } from "../../lib/prompts/evidence.ts";

const surfaces = [
  ["l'analyse d'un quiz", "../../lib/quiz/insights.ts"],
  ["la vue d'ensemble du portefeuille", "../../lib/insights/global.ts"],
  ["la synthèse d'un sondage", "../../lib/survey/analysis.ts"],
] as const;

// ── Ce que la règle exige ────────────────────────────────────────────

test("elle distingue explicitement le constat de la cause", () => {
  assert.match(EVIDENCE_RULES, /CE QUE TU SAIS, ET CE QUE TU SUPPOSES/);
  assert.match(EVIDENCE_RULES, /Une CAUSE n'est JAMAIS un constat/);
});

test("elle interdit la moyenne inventée, nommément", () => {
  // C'est la faute la plus grave : invérifiable, et elle sert à juger
  // quelqu'un.
  assert.match(EVIDENCE_RULES, /moyenne du secteur/);
  assert.match(EVIDENCE_RULES, /comparaison avec d'autres createurs/);
});

test("elle demande de dire COMMENT vérifier une piste", () => {
  // Une hypothèse sans moyen de la trancher, c'est ce qui envoie
  // quelqu'un travailler trois semaines à l'aveugle.
  assert.match(EVIDENCE_RULES, /COMMENT la verifier/);
});

test("elle interdit de combler un trou par une généralité de méthode", () => {
  // C'est exactement ce que faisait le coach sans chiffres : ça sonne
  // juste et ça ne parle pas du projet de la personne.
  assert.match(EVIDENCE_RULES, /Ne comble jamais un trou par une generalite/);
});

test("elle dit pourquoi, pas seulement quoi", () => {
  // Une interdiction sans sa raison est la première à sauter quand
  // quelqu'un retouche le prompt.
  assert.match(EVIDENCE_RULES, /ne pas envoyer quelqu'un travailler des semaines/);
});

test("sans chiffres, aucun diagnostic n'est fabriqué", () => {
  assert.match(NO_DATA_RULES, /TU N'AS PAS DE CHIFFRES/);
  assert.match(NO_DATA_RULES, /aucune question, aucun taux/);
});

// ── La règle est écrite comme on demande d'écrire ────────────────────

test("aucun tiret cadratin dans ce qu'on donne au modèle", () => {
  // Il recopie le ton de ce qu'il reçoit, et le texte produit finit
  // sous les yeux d'une créatrice.
  for (const block of [EVIDENCE_RULES, NO_DATA_RULES]) {
    assert.ok(!/[—–]/.test(block));
  }
});

test("elle reste courte, sinon elle est lue en diagonale", () => {
  // Une règle de trente lignes est survolée par un modèle comme par un
  // humain. Le plafond est un choix, pas un hasard.
  assert.ok(EVIDENCE_RULES.split("\n").length <= 10, "la règle doit tenir en quelques lignes");
});

// ── Elle s'applique PARTOUT ──────────────────────────────────────────

for (const [label, path] of surfaces) {
  test(`${label} reçoit la règle`, () => {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(/EVIDENCE_RULES/.test(src), `${label} doit l'inclure`);
  });

  test(`${label} n'a plus sa version affaiblie`, () => {
    // "Tu te bases uniquement sur les chiffres fournis" ne demande pas
    // de SIGNALER l'hypothèse : un modèle peut la respecter à la lettre
    // et quand même écrire une cause comme un fait.
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(
      !/Tu te bases UNIQUEMENT sur les chiffres fournis/.test(src),
      "l'ancienne formulation ne doit pas coexister avec la nouvelle",
    );
  });
}
