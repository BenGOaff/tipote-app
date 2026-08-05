// tests/logic/priority-rule.test.mts
//
// Béné, 4 août 2026 : "le coach n'est pas focus, il donne trop d'infos
// trop compliquées d'un coup. Il doit donner la bonne info au bon moment
// pour guider, pas assommer avec toute sa connaissance."
//
// Le rapport du 3 août à Jocelyne alignait cinq améliorations et cinq
// actions. La PREMIÈRE était la bonne. Elle a travaillé la deuxième
// pendant trois semaines, sur trois personnes.
//
// La règle avait été écrite pour l'analyse d'un quiz, et à la main. Trois
// autres surfaces produisaient des conseils sans elle. Ce fichier fige
// les deux garanties : la règle vit à UN endroit, et le plafond est dans
// le code, pas seulement dans la consigne.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_SECONDARY,
  PRIORITY_RULES,
  PRIORITY_RULES_CHAT,
  PRIORITY_RULES_CONTENT,
  capSecondary,
} from "../../lib/prompts/priority.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// ── Le plafond tient meme si le modele deborde ───────────────────────

test("une liste trop longue est coupee, pas seulement deconseillee", () => {
  // Une consigne seule ne survit pas au prochain qui touche au prompt.
  assert.deepEqual(capSecondary([1, 2, 3, 4, 5]), [1, 2, 3]);
  assert.equal(MAX_SECONDARY, 3);
});

test("une liste courte n'est pas rallongee", () => {
  assert.deepEqual(capSecondary(["a"]), ["a"]);
  assert.deepEqual(capSecondary([]), []);
});

// ── Ce que les trois variantes disent toutes ─────────────────────────

test("chaque variante designe UNE chose, pas un catalogue", () => {
  assert.match(PRIORITY_RULES, /UNE PRIORITE, PAS UNE LISTE/);
  assert.match(PRIORITY_RULES_CHAT, /DIS LAQUELLE TU RECOMMANDES/);
  assert.match(PRIORITY_RULES_CONTENT, /UNE PROMESSE CENTRALE/);
});

test("aucun tiret cadratin : le modele recopie le ton de ce qu'il recoit", () => {
  for (const block of [PRIORITY_RULES, PRIORITY_RULES_CHAT, PRIORITY_RULES_CONTENT]) {
    assert.ok(!/[—–]/.test(block));
  }
});

test("la variante conversationnelle laisse le choix a la creatrice", () => {
  // Recommander n'est pas decider a sa place : le piege inverse serait
  // de lui imposer un angle sans qu'elle puisse en changer.
  assert.match(PRIORITY_RULES_CHAT, /le choix reste le sien|Le choix reste le sien/);
});

// ── Les quatre surfaces l'appliquent ─────────────────────────────────

test("l'analyse d'un quiz nomme une priorite", () => {
  const src = read("../../lib/quiz/insights.ts");
  assert.match(src, /priority: \{ title: string; why: string; how: string \} \| null/);
});

test("la synthese de sondage aussi, et elle plafonne ses listes", () => {
  // C'est la surface qui avait le defaut le plus net : 3 a 5
  // enseignements PLUS 3 a 5 actions, sans dire par quoi commencer.
  const src = read("../../lib/survey/analysis.ts");
  assert.match(src, /PRIORITY_RULES/, "la regle vient du module commun");
  assert.match(src, /capSecondary\(/, "et le plafond est applique au parsing");
  assert.match(src, /priority:/);
  assert.doesNotMatch(src, /3 à 5 enseignements/, "l'ancienne consigne a disparu");
});

test("l'assistant de creation recommande au lieu de laisser trancher a l'aveugle", () => {
  const src = read("../../lib/prompts/quiz/chat.ts");
  assert.match(src, /PRIORITY_RULES_CHAT/);
  assert.match(src, /DIS LEQUEL TU RECOMMANDES/);
});

test("la regle n'est recopiee nulle part : elle vit dans un seul fichier", () => {
  // C'est la lecon de evidence.ts, de l'alignement du sous-titre et des
  // reseaux de partage : une regle ecrite a plusieurs endroits n'est pas
  // une regle.
  for (const f of ["../../lib/survey/analysis.ts", "../../lib/prompts/quiz/chat.ts"]) {
    assert.match(read(f), /from "@\/lib\/prompts\/priority"/, f);
  }
});

// ── Et l'ecran le montre ─────────────────────────────────────────────

test("le panneau de sondage affiche la priorite AVANT les listes", () => {
  const src = read("../../components/quiz/SurveyResultsPanel.tsx");
  const iPriority = src.indexOf("state.analysis.priority?.title");
  const iTakeaways = src.indexOf("state.analysis.takeaways.length");
  assert.ok(iPriority > 0, "la priorite est rendue");
  assert.ok(iPriority < iTakeaways, "et elle passe avant les enseignements");
});
