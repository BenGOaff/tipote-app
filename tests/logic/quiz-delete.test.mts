// tests/logic/quiz-delete.test.mts
//
// Béné, 3 août 2026 : "j'essaye de supprimer un quiz dans mes projets,
// rien à faire il est affiché" + un 400 nu dans la console.
//
// Ce qu'on fige ici : un refus de suppression est RECONNU comme un refus
// (pas comme une panne), il porte une raison exploitable, et son code
// HTTP dit "l'état des données s'y oppose" et non "ta requête est
// mauvaise". Le reste (afficher un toast) vit dans le composant, mais
// sans cette classification il n'aurait rien à afficher.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyDeleteError,
  deleteRefusalReason,
  deleteRefusalStatus,
} from "../../lib/quizDelete.ts";

test("pas d'erreur = suppression acceptée", () => {
  assert.deepEqual(classifyDeleteError(null), { kind: "ok" });
  assert.equal(deleteRefusalStatus({ kind: "ok" }), 200);
});

test("le quiz retenu par une vidéo interactive est identifié", () => {
  // Message tel que Postgres le rend sur popquiz_cues.quiz_id.
  const err = {
    code: "23503",
    message:
      'update or delete on table "quizzes" violates foreign key constraint "popquiz_cues_quiz_id_fkey" on table "popquiz_cues"',
    details: 'Key (id)=(e1ec0163-d163-4bbf-9925-8c73d23da5fd) is still referenced from table "popquiz_cues".',
  };
  assert.deepEqual(classifyDeleteError(err), { kind: "used_by_popquiz" });
  assert.equal(deleteRefusalReason({ kind: "used_by_popquiz" }), "used_by_popquiz");
});

test("409 et jamais 400 : la demande est valide, c'est l'état qui refuse", () => {
  // Le 400 d'origine laissait croire à une requête malformée, donc à un
  // bug de notre côté, et n'orientait vers aucune action.
  assert.equal(deleteRefusalStatus({ kind: "used_by_popquiz" }), 409);
  assert.equal(deleteRefusalStatus({ kind: "still_referenced" }), 409);
});

test("une autre clé étrangère est reconnue sans être attribuée aux vidéos", () => {
  const err = {
    code: "23503",
    message: 'violates foreign key constraint "autre_chose_quiz_id_fkey" on table "autre_chose"',
    details: null,
  };
  assert.deepEqual(classifyDeleteError(err), { kind: "still_referenced" });
});

test("on reconnaît la contrainte même sans code SQLSTATE", () => {
  // Certains proxies rendent le message sans le code : on ne doit pas
  // retomber sur "panne", sinon l'utilisatrice lit "erreur inconnue"
  // pour un cas qu'on sait expliquer.
  const err = { code: null, message: "foreign key violation on popquiz_cues", details: null };
  assert.deepEqual(classifyDeleteError(err), { kind: "used_by_popquiz" });
});

test("une vraie panne reste une panne, avec son message", () => {
  const err = { code: "08006", message: "connection failure", details: null };
  const refusal = classifyDeleteError(err);
  assert.equal(refusal.kind, "failed");
  assert.equal(deleteRefusalStatus(refusal), 500);
  assert.equal(refusal.kind === "failed" ? refusal.detail : "", "connection failure");
});

test("une panne sans message reste diagnosticable", () => {
  const refusal = classifyDeleteError({ code: "XX000", message: "", details: null });
  assert.equal(refusal.kind === "failed" ? refusal.detail : "", "unknown");
});
