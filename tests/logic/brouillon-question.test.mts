// tests/logic/brouillon-question.test.mts
//
// Adeline, 1er septembre 2026 : "on peut revenir en arrière, ce qui est
// un plus, mais lorsqu'on le fait ça efface les cases suivantes déjà
// remplies."
//
// Rien n'était effacé en base : `answers` n'a jamais été tronqué. Ce qui
// suivait le visiteur, c'était le BROUILLON de saisie, gardé dans quatre
// variables globales au composant et jamais remises à la question
// affichée. Le texte tapé en question 3 arrivait pré-rempli en question
// 4, et le valider écrasait la réponse déjà donnée.
//
// Ce fichier fige les cinq situations qu'elle et les autres ont pu
// rencontrer, et surtout les DEUX répondues par le fait qu'un brouillon
// vide est une intention et non une absence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BROUILLON_VIDE,
  brouillonPourQuestion,
} from "../../lib/quiz/brouillonReponse.ts";

// ── Ce qu'Adeline a vu ───────────────────────────────────────────────

test("une question jamais répondue s'ouvre vide, jamais avec la précédente", () => {
  const b = brouillonPourQuestion(undefined, -1);
  assert.equal(b.texte, "");
  assert.deepEqual(b.options, []);
  assert.equal(b.autreTexte, "");
  assert.equal(b.autreChoisi, false);
});

test("revenir sur un texte libre déjà écrit le rend relisable", () => {
  const b = brouillonPourQuestion({ kind: "text", value: "je manque de temps" }, -1);
  assert.equal(b.texte, "je manque de temps");
});

test("revenir sur un multi-choix rend TOUTES les cases cochées", () => {
  const b = brouillonPourQuestion({ kind: "options", optionIndices: [2, 0] }, -1);
  // Triées : le premier clic repart de cette liste, donc décocher une
  // case ne doit pas en emporter deux autres au passage.
  assert.deepEqual(b.options, [0, 2]);
});

test("le tableau rendu est NEUF : cocher une case ne réécrit pas la réponse enregistrée", () => {
  const indices = [1, 3];
  const b = brouillonPourQuestion({ kind: "options", optionIndices: indices }, -1);
  b.options.push(4);
  assert.deepEqual(indices, [1, 3]);
});

// ── Les deux cas que le repli d'avant rendait impossibles ────────────
//
// L'affichage faisait `brouillon.length > 0 ? brouillon : réponse
// enregistrée`. Un brouillon vide retombait donc sur l'ancienne réponse.

test("un brouillon vide reste vide : on peut tout décocher", () => {
  // L'appelant ne rend PAS la sélection enregistrée quand le visiteur a
  // tout décoché : c'est cette fonction qui décide de l'état d'ARRIVÉE,
  // et personne d'autre ensuite.
  const b = brouillonPourQuestion({ kind: "options", optionIndices: [] }, -1);
  assert.deepEqual(b.options, []);
});

test("un texte effacé reste effacé", () => {
  const b = brouillonPourQuestion({ kind: "text", value: "" }, -1);
  assert.equal(b.texte, "");
});

// ── Le "Autre : précisez" ────────────────────────────────────────────

test("revenir sur un Autre en choix simple ROUVRE le champ et rend le texte", () => {
  const b = brouillonPourQuestion({ kind: "option", optionIndex: 3, text: "coach sportif" }, 3);
  assert.equal(b.autreChoisi, true);
  assert.equal(b.autreTexte, "coach sportif");
});

test("une option ordinaire n'ouvre AUCUN champ Autre", () => {
  const b = brouillonPourQuestion({ kind: "option", optionIndex: 1, text: "coach" }, 3);
  assert.equal(b.autreChoisi, false);
  assert.equal(b.autreTexte, "");
});

test("sans Autre dans la question (-1), aucun champ ne s'ouvre", () => {
  // On ne DEVINE jamais la présence d'un "Autre" depuis un `text` : une
  // question sans "Autre" ouvrirait un champ qui n'existe pas.
  const b = brouillonPourQuestion({ kind: "option", optionIndex: 0, text: "quelque chose" }, -1);
  assert.equal(b.autreChoisi, false);
  assert.equal(b.autreTexte, "");
});

test("en multi-choix, le texte du Autre revient mais le drapeau reste faux", () => {
  // Le champ d'un multi-choix suit la CASE cochée, pas le drapeau : c'est
  // la case qui l'ouvre, et elle est déjà dans `options`.
  const b = brouillonPourQuestion({ kind: "options", optionIndices: [0, 2], text: "autre chose" }, 2);
  assert.deepEqual(b.options, [0, 2]);
  assert.equal(b.autreTexte, "autre chose");
  assert.equal(b.autreChoisi, false);
});

test("le texte du Autre est ignoré quand la case Autre n'est pas cochée", () => {
  const b = brouillonPourQuestion({ kind: "options", optionIndices: [0, 1], text: "resté d'avant" }, 2);
  assert.equal(b.autreTexte, "");
});

// ── Les types à un tap n'ont rien à reprendre ────────────────────────

test("note et étoiles n'ouvrent aucun brouillon", () => {
  assert.deepEqual(brouillonPourQuestion({ kind: "rating", value: 4 }, -1), { ...BROUILLON_VIDE });
  assert.deepEqual(brouillonPourQuestion({ kind: "star", value: 2 }, -1), { ...BROUILLON_VIDE });
});

// ── Ce qui peut arriver d'un JSONB ───────────────────────────────────

test("une réponse abîmée ne casse pas l'écran", () => {
  const bizarre = { kind: "options", optionIndices: null } as unknown as Parameters<
    typeof brouillonPourQuestion
  >[0];
  assert.deepEqual(brouillonPourQuestion(bizarre, -1).options, []);
  const sansTexte = { kind: "text" } as unknown as Parameters<typeof brouillonPourQuestion>[0];
  assert.equal(brouillonPourQuestion(sansTexte, -1).texte, "");
});

test("BROUILLON_VIDE est figé : personne ne peut le modifier pour tout le monde", () => {
  assert.throws(() => {
    (BROUILLON_VIDE as { texte: string }).texte = "x";
  });
});

// ── Le garde-fou qui empêche le retour du bug ────────────────────────

test("le viewer ne recalcule PLUS l'affichage depuis la réponse enregistrée", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../../components/quiz/PublicQuizClient.tsx", import.meta.url),
    "utf8",
  );
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  // Les deux replis qui empêchaient d'effacer une réponse.
  assert.ok(
    !code.includes("multiOptionsDraft.length > 0"),
    "le repli sur la sélection enregistrée est revenu : décocher la dernière case redeviendrait impossible",
  );
  assert.ok(
    !code.includes("freeTextDraft ||"),
    "le repli sur le texte enregistré est revenu : vider un texte redeviendrait impossible",
  );

  // Et la remise à la question courante vit à UN seul endroit.
  assert.ok(
    code.includes("brouillonPourQuestion("),
    "le viewer doit dériver son brouillon de la question courante",
  );
  assert.equal(
    (code.match(/setMultiOptionsDraft\(/g) ?? []).length,
    4,
    "setMultiOptionsDraft ne doit vivre que dans commitAnswer, skipQuestion, toggleMultiOption et l'effet de remise",
  );
});
