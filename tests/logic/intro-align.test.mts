// tests/logic/intro-align.test.mts
//
// Béné, 3 août 2026 : "je ne comprends pas pourquoi il y a toujours ce
// décalage entre le titre et le sous-titre. On a déjà parlé de ça mille
// fois et ça n'a pas été corrigé. Je veux juste que si j'aligne mon
// texte à gauche, le titre et le sous-titre commencent au même endroit
// à gauche, je ne veux pas de décalage par défaut."
//
// Le "mille fois" est la vraie information : la règle était réécrite en
// ternaires dans chaque écran de chaque composant, donc chaque
// correction en oubliait un. Elle vit maintenant ici, et ce test la
// tient.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  alignBlockMarginClass,
  alignJustifyClass,
  alignTextClass,
  resolveBlockAlign,
  richTextAlign,
} from "../../lib/quiz/textAlign.ts";

const TITLE_LEFT = '<div style="text-align: left">Combien de clients tu as perdus ?</div>';
const TITLE_CENTER = '<div style="text-align: center">Combien de clients tu as perdus ?</div>';
const PLAIN = "<div>Découvre ce qui bloque tes ventes.</div>";

test("titre à gauche : le sous-titre se cale à gauche, PAS au centre", () => {
  // Le cas exact de la capture. `mr-auto` et surtout pas `mx-auto` :
  // c'est ce dernier qui poussait le sous-titre vers la droite.
  const align = resolveBlockAlign(PLAIN, TITLE_LEFT, "centered");
  assert.equal(align, "left");
  assert.equal(alignBlockMarginClass(align), "mr-auto");
  assert.equal(alignTextClass(align), "text-left");
});

test("titre centré : le sous-titre reste centré", () => {
  const align = resolveBlockAlign(PLAIN, TITLE_CENTER, "left");
  assert.equal(align, "center");
  assert.equal(alignBlockMarginClass(align), "mx-auto");
});

test("l'alignement PROPRE du bloc passe devant celui du titre", () => {
  // Aligner le sous-titre à gauche sous un titre centré est un choix
  // délibéré : le recentrer serait absurde.
  const align = resolveBlockAlign(
    '<div style="text-align: left">Sous-titre</div>',
    TITLE_CENTER,
    "centered",
  );
  assert.equal(align, "left");
  assert.equal(alignBlockMarginClass(align), "mr-auto");
});

test("rien d'aligné : on suit la disposition du quiz", () => {
  assert.equal(resolveBlockAlign(PLAIN, PLAIN, "centered"), "center");
  assert.equal(resolveBlockAlign(PLAIN, PLAIN, "left"), "left");
  assert.equal(resolveBlockAlign(PLAIN, PLAIN, "split"), "left");
  // Disposition inconnue ou absente : gauche, jamais un centrage subi.
  assert.equal(resolveBlockAlign(PLAIN, PLAIN, null), "left");
  assert.equal(resolveBlockAlign(null, null, undefined), "left");
});

test("un champ jamais aligné se distingue d'un champ aligné à gauche", () => {
  // Sans ce null, un titre auquel personne n'a touché imposerait la
  // gauche à tout l'écran et casserait les quiz centrés existants.
  assert.equal(richTextAlign(PLAIN), null);
  assert.equal(richTextAlign(""), null);
  assert.equal(richTextAlign(null), null);
  assert.equal(richTextAlign(TITLE_LEFT), "left");
});

test("l'écriture du style est tolérée telle que le navigateur la produit", () => {
  // contentEditable écrit tantôt `text-align:center`, tantôt
  // `TEXT-ALIGN: CENTER`, avec ou sans espace. Les trois doivent passer.
  assert.equal(richTextAlign('<p style="text-align:center">x</p>'), "center");
  assert.equal(richTextAlign('<p style="TEXT-ALIGN:  CENTER">x</p>'), "center");
  assert.equal(richTextAlign('<p style="text-align: right;">x</p>'), "right");
});

test("aligné à droite : le bloc colle à droite", () => {
  const align = resolveBlockAlign('<p style="text-align: right">x</p>', PLAIN, "centered");
  assert.equal(align, "right");
  assert.equal(alignBlockMarginClass(align), "ml-auto");
  assert.equal(alignTextClass(align), "text-right");
  assert.equal(alignJustifyClass(align), "justify-end");
});

test("le logo et le bouton suivent le même bord", () => {
  assert.equal(alignJustifyClass("left"), "justify-start");
  assert.equal(alignJustifyClass("center"), "justify-center");
});
