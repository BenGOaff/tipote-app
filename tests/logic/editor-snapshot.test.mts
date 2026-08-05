// tests/logic/editor-snapshot.test.mts
//
// Jocelyne, 4 août 2026 : "à chaque fois que je ferme et que je reviens,
// il me redemande si je veux garder la dernière sauvegarde automatique ou
// la dernière sauvegarde que j'ai faite moi. Je sauvegarde toujours avant
// de sortir. C'est bizarre, ça ne faisait pas ça au départ."
//
// L'éditeur ne devait proposer la restauration que si le brouillon
// DIFFÈRE du quiz sauvegardé. Le contrôle existait, et il comparait deux
// objets écrits à la main à deux endroits. Onze champs manquaient d'un
// côté : la comparaison ne pouvait donc plus jamais dire "identique".
//
// Ce fichier fige la seule chose qui empêche que ça recommence : les deux
// côtés passent par le MÊME constructeur.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildQuizEditorSnapshot,
  diffEditorSnapshot,
  draftDiffersFromSaved,
  QUIZ_SNAPSHOT_KEYS,
  stableStringify,
  type QuizEditorSnapshotInput,
} from "../../lib/quiz/editorSnapshot.ts";

/** Un instantané plausible : toutes les clés, des valeurs quelconques. */
function sampleInput(over: Partial<Record<string, unknown>> = {}): QuizEditorSnapshotInput {
  const base = {} as Record<string, unknown>;
  for (const k of QUIZ_SNAPSHOT_KEYS) base[k] = null;
  base.title = "Mon quiz";
  base.question_layout = "centered";
  base.answer_layout = "auto";
  base.tie_break = "answers";
  base.questions = [{ id: "q1", question_text: "Ça va ?" }];
  return { ...base, ...over } as QuizEditorSnapshotInput;
}

// ── Ce que le constructeur garantit ──────────────────────────────────

test("deux instantanés du même contenu sont strictement identiques", () => {
  // C'est la promesse : l'état de l'éditeur et la reconstruction depuis
  // les colonnes produisent la MÊME chaîne, donc "rien à restaurer".
  const a = buildQuizEditorSnapshot(sampleInput());
  const b = buildQuizEditorSnapshot(sampleInput());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(draftDiffersFromSaved(a, b), false);
});

test("l'ordre d'écriture des clés ne change rien au verdict", () => {
  // Les brouillons DÉJÀ en base ont été écrits par les versions
  // précédentes, dans un autre ordre. Sans tri, chacun d'eux
  // déclencherait le dialogue une dernière fois pour rien.
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const draftDansLAutreSens: Record<string, unknown> = {};
  for (const k of [...QUIZ_SNAPSHOT_KEYS].reverse()) {
    draftDansLAutreSens[k] = (canonical as Record<string, unknown>)[k];
  }
  assert.equal(draftDiffersFromSaved(draftDansLAutreSens, canonical), false);
});

test("le tri descend aussi dans les questions", () => {
  const canonical = buildQuizEditorSnapshot(
    sampleInput({ questions: [{ id: "q1", question_text: "Ça va ?" }] }),
  );
  const draft = { ...canonical, questions: [{ question_text: "Ça va ?", id: "q1" }] };
  assert.equal(draftDiffersFromSaved(draft, canonical), false);
});

test("une vraie modification est bien détectée", () => {
  // L'autre moitié de la promesse : on ne doit pas non plus lui faire
  // perdre un brouillon qui contient vraiment quelque chose.
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const draft = buildQuizEditorSnapshot(sampleInput({ title: "Mon quiz (v2)" }));
  assert.equal(draftDiffersFromSaved(draft, canonical), true);
});

test("un champ absent du brouillon compte comme une différence", () => {
  // Un brouillon tronqué n'est PAS équivalent au quiz sauvegardé : mieux
  // vaut proposer la restauration que faire disparaître du travail.
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const { title: _drop, ...tronque } = canonical as Record<string, unknown>;
  assert.equal(draftDiffersFromSaved(tronque, canonical), true);
});

test("stableStringify ne casse pas les tableaux", () => {
  // Un tableau garde son ordre : l'ordre des questions est du contenu,
  // pas de la présentation.
  assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]));
});

// ── Savoir au lieu de supposer ───────────────────────────────────────

test("on peut nommer les champs qui diffèrent", () => {
  // Le 4 août, on a passé une journée sur des hypothèses parce que le
  // brouillon est effacé dès que la créatrice répond au dialogue : plus
  // rien à observer après coup. Maintenant l'éditeur écrit les noms.
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const draft = buildQuizEditorSnapshot(
    sampleInput({ title: "autre", question_layout: "left" }),
  );
  assert.deepEqual(diffEditorSnapshot(draft, canonical), ["question_layout", "title"]);
});

test("rien à signaler quand tout colle", () => {
  const canonical = buildQuizEditorSnapshot(sampleInput());
  assert.deepEqual(diffEditorSnapshot(buildQuizEditorSnapshot(sampleInput()), canonical), []);
});

test("un champ absent d'un côté est nommé, pas ignoré", () => {
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const { tie_break: _drop, ...tronque } = canonical as Record<string, unknown>;
  assert.deepEqual(diffEditorSnapshot(tronque, canonical), ["tie_break"]);
});

test("on ne journalise que des NOMS de champs", () => {
  // Ces instantanés portent le texte du quiz d'une créatrice : il n'a
  // rien à faire dans une console ni dans un journal.
  const canonical = buildQuizEditorSnapshot(sampleInput());
  const draft = buildQuizEditorSnapshot(sampleInput({ title: "Mon secret commercial" }));
  const diff = diffEditorSnapshot(draft, canonical);
  assert.deepEqual(diff, ["title"]);
  assert.ok(!diff.join(" ").includes("secret"));
});

// ── Le garde-fou structurel ──────────────────────────────────────────
//
// Le typecheck oblige déjà les deux appelants à fournir toutes les clés.
// Encore faut-il qu'ils passent par le constructeur : ce test interdit le
// retour à un objet écrit à la main.

test("l'éditeur de sondage compare lui aussi avant de proposer", () => {
  // Il ne comparait RIEN : tout brouillon plus récent déclenchait le
  // dialogue, identique ou pas.
  const src = readFileSync(new URL("../../components/quiz/SurveyDetailClient.tsx", import.meta.url), "utf8");
  const calls = src.match(/buildSurveyEditorSnapshot\(/g) ?? [];
  assert.equal(calls.length, 2, "état de l'éditeur + reconstruction canonique");
  assert.ok(
    /diffEditorSnapshot\(/.test(src),
    "le sondage doit comparer le CONTENU, pas seulement les dates, et nommer les champs qui diffèrent",
  );
});

test("l'éditeur construit ses DEUX instantanés avec la même fonction", () => {
  const src = readFileSync(new URL("../../components/quiz/QuizDetailClient.tsx", import.meta.url), "utf8");
  const calls = src.match(/buildQuizEditorSnapshot\(/g) ?? [];
  assert.equal(
    calls.length,
    2,
    "l'état de l'éditeur ET la reconstruction depuis les colonnes doivent passer par buildQuizEditorSnapshot",
  );
  assert.ok(
    /diffEditorSnapshot\(/.test(src),
    "l'éditeur doit nommer les champs qui diffèrent, sinon on en est réduit aux hypothèses",
  );
  assert.ok(
    !/JSON\.stringify\(draftState\)/.test(src),
    "la comparaison du brouillon passe par draftDiffersFromSaved, jamais par un JSON.stringify direct (l'ordre des clés fausserait le verdict)",
  );
});
