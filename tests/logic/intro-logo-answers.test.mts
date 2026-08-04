// tests/logic/intro-logo-answers.test.mts
//
// Trois retours de Béné du 3 août 2026, trois fois le MÊME défaut : une
// décision de mise en page recalculée dans un composant au lieu d'être
// appelée depuis une fonction unique.
//
// 1. "Si je centre mon titre à gauche, il centre aussi le logo."
//    Le logo n'avait aucune vie propre : il héritait du titre.
// 2. "Pourquoi la case du sous titre est plus courte que celle du titre ?"
//    Un `max-w-xl` en dur sur le sous-titre, sous un `max-w-2xl` de
//    conteneur. Invisible tant que tout est centré.
// 3. "J'ai choisi liste et je vois toujours mes colonnes c'est PAS bon."
//    L'aperçu de l'éditeur ignorait `answer_layout` et comptait les
//    options avec sa propre règle.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  answerGridClass,
  answerImageGridClass,
  resolveAnswerLayout,
} from "../../lib/quiz/answerLayout.ts";
import {
  introTextWidthPct,
  introTextWidthStyle,
  logoAlignSetting,
  logoRender,
  logoWidthPct,
  resolveLogoAlign,
} from "../../lib/quiz/introLayout.ts";

// ── Béné : "il centre aussi le logo" ────────────────────────────────

test("sans réglage, le logo suit le titre : les quiz existants ne bougent pas", () => {
  assert.equal(resolveLogoAlign(null, "left"), "left");
  assert.equal(resolveLogoAlign(undefined, "center"), "center");
  assert.equal(resolveLogoAlign("auto", "right"), "right");
});

test("le logo s'aligne INDÉPENDAMMENT du titre", () => {
  // Le coeur de la demande : titre à gauche, logo centré.
  assert.equal(resolveLogoAlign("center", "left"), "center");
  assert.equal(resolveLogoAlign("left", "center"), "left");
  assert.equal(resolveLogoAlign("right", "left"), "right");
});

test("une valeur inconnue retombe sur le titre, jamais sur une position inventée", () => {
  assert.equal(logoAlignSetting("nawak"), "auto");
  assert.equal(resolveLogoAlign("nawak", "left"), "left");
});

test("sans largeur, le logo garde EXACTEMENT sa taille historique", () => {
  const r = logoRender("center", null);
  assert.equal(r.imgClass, "max-h-16 w-auto object-contain");
  assert.equal(r.imgStyle, undefined);
});

test("avec largeur, le logo se règle comme une image ou un gif", () => {
  const r = logoRender("left", 40);
  assert.equal(r.imgStyle?.width, "40%");
  assert.ok(!r.imgClass.includes("max-h-16"), "la borne de hauteur ne doit plus brider la largeur");
  assert.equal(r.wrapperClass, "flex justify-start");
});

test("une largeur hors bornes rend la taille d'avant, pas une taille rabotée", () => {
  assert.equal(logoWidthPct(0), null);
  assert.equal(logoWidthPct(5), null);
  assert.equal(logoWidthPct(140), null);
  assert.equal(logoWidthPct("40"), null);
  assert.equal(logoWidthPct(40), 40);
});

test("chaque alignement produit son conteneur", () => {
  assert.equal(logoRender("left", null).wrapperClass, "flex justify-start");
  assert.equal(logoRender("center", null).wrapperClass, "flex justify-center");
  assert.equal(logoRender("right", null).wrapperClass, "flex justify-end");
});

// ── Béné : "la case du sous titre est plus courte" ──────────────────

test("par défaut, aucune largeur imposée : titre et sous-titre partagent le conteneur", () => {
  // C'est ce qui remplace le `max-w-xl` en dur. Pas de style = pas de
  // borne propre au sous-titre = pas de décalage possible.
  assert.equal(introTextWidthPct(null), null);
  assert.equal(introTextWidthStyle(null), undefined);
});

test("le curseur borne le bloc COMMUN, pas un des deux champs", () => {
  assert.equal(introTextWidthPct(70), 70);
  assert.deepEqual(introTextWidthStyle(70), { width: "70%" });
});

test("100% est traité comme 'pas de réglage'", () => {
  // Sinon on écrirait `width: 100%` en base pour rien, et une future
  // lecture croirait la créatrice a fait un choix explicite.
  assert.equal(introTextWidthPct(100), null);
});

test("une largeur absurde ne rétrécit pas l'accueil", () => {
  assert.equal(introTextWidthPct(10), null);
  assert.equal(introTextWidthPct(-30), null);
});

// ── Béné : "j'ai choisi liste et je vois toujours mes colonnes" ─────

test("LISTE force une seule colonne, quel que soit le nombre de réponses", () => {
  // Le bug exact : 4 réponses en "Liste" restaient sur deux colonnes.
  assert.equal(answerGridClass("list", 4), "grid-cols-1");
  assert.equal(answerGridClass("list", 9), "grid-cols-1");
  assert.equal(answerGridClass("list", 2), "grid-cols-1");
});

test("COLONNES force deux colonnes, même à deux réponses", () => {
  assert.equal(answerGridClass("grid", 2), "grid-cols-1 sm:grid-cols-2");
});

test("AUTO suit le nombre de réponses", () => {
  assert.equal(answerGridClass("auto", 2), "grid-cols-1");
  assert.equal(answerGridClass("auto", 3), "grid-cols-1 sm:grid-cols-2");
});

test("le réglage de la question prime sur celui du quiz", () => {
  assert.equal(resolveAnswerLayout("grid", "list"), "list");
  assert.equal(resolveAnswerLayout("list", "grid"), "grid");
});

test("une surcharge illisible n'écrase pas le choix du quiz", () => {
  // "auto", null, une typo : la question n'a rien décidé, le quiz décide.
  assert.equal(resolveAnswerLayout("list", "auto"), "list");
  assert.equal(resolveAnswerLayout("list", null), "list");
  assert.equal(resolveAnswerLayout("list", "nawak"), "list");
  assert.equal(resolveAnswerLayout(null, null), "auto");
});

test("les réponses illustrées suivent LISTE aussi", () => {
  // On assertionne le NOMBRE DE COLONNES, pas la chaîne entière : depuis
  // que l'image garde son format réel, la grille porte aussi
  // `items-start` (cf. lib/quiz/answerImage.ts), et une classe de
  // présentation ajoutée plus tard ne doit pas faire rougir un test qui
  // parle de colonnes.
  assert.ok(!answerImageGridClass("list").includes("sm:grid-cols-2"));
  assert.ok(answerImageGridClass("list").includes("grid-cols-1"));
  assert.ok(answerImageGridClass("auto").includes("sm:grid-cols-2"));
});

test("l'aperçu mobile empile, comme le téléphone réel", () => {
  // Le canvas mobile de l'éditeur est étroit mais le VIEWPORT ne l'est
  // pas : sans ça, les classes sm: resteraient actives et l'aperçu
  // montrerait deux colonnes que le visiteur ne verra jamais.
  assert.equal(answerGridClass("grid", 4, { stacked: true }), "grid-cols-1");
  assert.ok(!answerImageGridClass("grid", { stacked: true }).includes("sm:grid-cols-2"));
});
