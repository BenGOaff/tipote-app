// tests/logic/question-layout.test.mts
//
// Béné, 4 août 2026 : "il faut laisser le choix de TOUT aligner / centrer
// OU de modifier : par exemple une question où les réponses sont
// centrées, mais la suivante alignée à gauche, ou même une question en
// colonnes et une en liste. MAIS faut le faire BIEN."
//
// Et surtout : "tu empiles les trucs, ça devient n'importe quoi
// l'éditeur." Le vrai défaut n'était pas l'absence de réglage, c'était
// l'étage clandestin : l'alignement écrit DANS un champ gagne pour
// toujours, donc le réglage global ne pouvait plus rien reprendre.
//
// Ce fichier fige les deux garanties qui comptent : rien ne bouge sur les
// quiz existants, et "tout réaligner" fait vraiment ce qu'il promet.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clearRichTextAlign,
  questionAlignSetting,
  questionAnswerLayoutSetting,
  resolveQuestionAlign,
  resolveQuestionAnswerLayout,
} from "../../lib/quiz/questionLayout.ts";
import { resolveAnswerLayout } from "../../lib/quiz/answerLayout.ts";

// ── La garantie qui protège les quiz déjà en ligne ───────────────────

test("une question qui ne se prononce pas suit le quiz", () => {
  // Le cas de TOUS les quiz existants : `config.align` n'existe pas.
  assert.equal(resolveQuestionAlign(undefined, "centered"), "center");
  assert.equal(resolveQuestionAlign(undefined, "left"), "left");
  assert.equal(resolveQuestionAlign(undefined, "split"), "left");
  assert.equal(resolveQuestionAlign(undefined, null), "left");
});

test("une valeur illisible vaut 'je ne me prononce pas'", () => {
  // Colonne absente, faute de frappe, vieille valeur : jamais d'écran
  // cassé, on retombe sur le réglage du quiz.
  for (const nawak of [null, "", "nawak", 42, {}, true]) {
    assert.equal(questionAlignSetting(nawak), "inherit", String(nawak));
    assert.equal(resolveQuestionAlign(nawak, "centered"), "center");
  }
});

// ── Ce que le nouvel étage permet ────────────────────────────────────

test("une question fait exception sans toucher aux autres", () => {
  // La demande, mot pour mot : une centrée, la suivante à gauche.
  assert.equal(resolveQuestionAlign("left", "centered"), "left");
  assert.equal(resolveQuestionAlign("center", "left"), "center");
  // Et la voisine, qui ne se prononce pas, garde le réglage du quiz.
  assert.equal(resolveQuestionAlign(undefined, "centered"), "center");
});

test("une question en colonnes, la suivante en liste", () => {
  assert.equal(resolveAnswerLayout("list", resolveQuestionAnswerLayout("grid")), "grid");
  assert.equal(resolveAnswerLayout("grid", resolveQuestionAnswerLayout("list")), "list");
  // Sans exception, c'est le réglage du quiz qui décide.
  assert.equal(resolveAnswerLayout("list", resolveQuestionAnswerLayout("inherit")), "list");
  assert.equal(resolveQuestionAnswerLayout(undefined), undefined);
  assert.equal(questionAnswerLayoutSetting("nawak"), "inherit");
});

// ── "Tout réaligner" : la moitié qui manquait ────────────────────────

test("l'alignement écrit à la main dans un champ est retiré", () => {
  // C'est LUI qui empêchait le réglage global de reprendre la main.
  assert.equal(
    clearRichTextAlign('<div style="text-align: center;">Prêt ?</div>'),
    "<div>Prêt ?</div>",
  );
  assert.equal(
    clearRichTextAlign('<p class="text-left">Alors ?</p>'),
    "<p>Alors ?</p>",
  );
  assert.equal(
    clearRichTextAlign('<div align="center">Coucou</div>'),
    "<div>Coucou</div>",
  );
});

test("le reste de la mise en forme est CONSERVÉ", () => {
  // On retire l'alignement, pas son travail : le gras, la couleur et la
  // taille lui appartiennent.
  const out = clearRichTextAlign(
    '<div style="text-align:center;color:#e11d48;font-size:20px"><b>Important</b></div>',
  );
  assert.match(out, /color:#e11d48/);
  assert.match(out, /font-size:20px/);
  assert.match(out, /<b>Important<\/b>/);
  assert.ok(!/text-align/.test(out));
});

test("un champ sans alignement n'est pas abîmé", () => {
  const html = '<div style="color:#111"><i>rien à faire</i></div>';
  assert.equal(clearRichTextAlign(html), html);
  assert.equal(clearRichTextAlign(""), "");
  assert.equal(clearRichTextAlign(null), "");
  assert.equal(clearRichTextAlign(undefined), "");
});

test("l'opération est idempotente", () => {
  // Le bouton peut être cliqué dix fois de suite sans dégrader le champ.
  const once = clearRichTextAlign('<div style="text-align:right;color:red">Hop</div>');
  assert.equal(clearRichTextAlign(once), once);
});
