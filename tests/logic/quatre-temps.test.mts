// tests/logic/quatre-temps.test.mts
//
// Béné, 25 août 2026, capture à l'appui : "pourquoi mon résultat sur un
// nouveau quiz est arrivé en prise de conscience et si au lieu du profil
// en 4 temps ?? On ne devait PAS le supprimer !!"
//
// -- CE QUI S'ÉTAIT VRAIMENT PASSÉ ------------------------------------
//
// Rien n'avait été supprimé. Le bug datait du 3 août, jour où les 4
// temps ont été écrits, et il n'avait jamais été vu :
//
//   le prompt DEMANDE un pont            -> ok
//   la base a les colonnes               -> ok
//   POST /api/quiz les accepte           -> ok
//   QuizFormClient, AU MILIEU            -> il les jetait
//
// Le type `QuizResult` du formulaire n'avait ni `bridge`, ni
// `bridge_heading`, ni les deux titres. Les TROIS endroits qui recopient
// un résultat (génération -> état, et les deux corps de POST) listent
// leurs champs un par un : ce qui n'est pas listé disparaît. Le pont
// était donc détruit dès la sortie de l'IA.
//
// Conséquence : `hasBridgeContent` répondait toujours non, et AUCUN quiz
// créé par ce formulaire n'a jamais pu naître en 4 temps.
//
// C'est le motif le plus cher de ce dépôt : une décision qui traverse
// plusieurs fichiers, et un maillon qui l'oublie en silence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildResultBeats } from "../../lib/quiz/resultBeats.ts";

const lire = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FORM = lire("../../components/quiz/QuizFormClient.tsx");
const ROUTE = lire("../../app/api/quiz/route.ts");

const CHAMPS = ["insight_heading", "projection_heading", "bridge", "bridge_heading"] as const;

test("le formulaire de creation transmet les 4 temps", () => {
  // La regression a interdire : un champ retire d'un des mappings
  // disparait en silence, et personne ne le voit avant une cliente.
  for (const champ of CHAMPS) {
    const occurrences = (FORM.match(new RegExp(`\\b${champ}\\b`, "g")) ?? []).length;
    assert.ok(
      occurrences >= 4,
      `${champ} n'apparait que ${occurrences} fois : il manque dans le type ou dans un des trois mappings`,
    );
  }
});

test("un quiz NEUF nait en 4 temps", () => {
  assert.match(ROUTE, /result_layout: "beats",/);
  // La condition d'avant a disparu : elle etait inatteignable, et le
  // viewer sait deja sauter un bloc vide.
  assert.ok(!/hasBridgeContent\(body\.results\)/.test(ROUTE));
});

test("AUCUN quiz existant ne bouge", () => {
  // Cette route ne CREE que des nouveaux quiz. Un quiz deja en ligne
  // garde le defaut 'classic' de la colonne, et bascule quand sa
  // creatrice le decide.
  assert.ok(/insert\(/.test(ROUTE));
  assert.ok(
    !/update\([^)]*result_layout/.test(ROUTE),
    "cette route ne doit jamais REECRIRE le layout d'un quiz existant",
  );
});

// ── Pourquoi la prudence d'avant etait inutile ──────────────────────

const strip = (s: string) => s.replace(/<[^>]*>/g, "");
const quiz = {
  show_result_insight: true,
  show_result_projection: true,
  show_result_bridge: true,
  result_insight_heading: null,
  result_projection_heading: null,
  result_bridge_heading: null,
} as never;
const titres = { cause: "La cause", path: "Le chemin", bridge: "Le pont" };

test("un bloc vide ne rend RIEN, donc pas de page bancale", () => {
  const beats = buildResultBeats(
    { result: { insight: "Ce qui bloque", projection: "", bridge: "" } as never, quiz, fallbackHeadings: titres },
    strip,
  );
  assert.deepEqual(beats.map((b) => b.key), ["cause"], "seuls les temps REMPLIS sortent");
});

test("un quiz sans pont rend simplement les temps qu'il a", () => {
  const beats = buildResultBeats(
    { result: { insight: "A", projection: "B", bridge: "" } as never, quiz, fallbackHeadings: titres },
    strip,
  );
  assert.deepEqual(beats.map((b) => b.key), ["cause", "path"]);
});

test("un resultat entierement vide ne rend aucun bloc", () => {
  const beats = buildResultBeats(
    { result: { insight: "", projection: "", bridge: "" } as never, quiz, fallbackHeadings: titres },
    strip,
  );
  assert.deepEqual(beats, []);
});
