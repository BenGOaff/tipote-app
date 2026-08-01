// tests/logic/editor-field-size.test.mts
//
// Taille de police d'un champ (drame Jocelyne, 1er août 2026) : "sur la
// sixième réponse je ne peux pas agrandir la police". C'était la réponse
// qu'elle avait CENTRÉE : le navigateur avait déplacé l'enveloppe de
// taille, et un clic de plus en empilait une seconde.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  FIELD_FONT_SIZES,
  FIELD_FS_CLASS,
  applyFieldFontSize,
  readFieldFontSize,
} from "../../lib/richTextFieldSize.ts";

const dom = new JSDOM("<!doctype html><body></body>");
const document = dom.window.document;
// Le module lit `el.ownerDocument` : aucune globale à installer.
const field = (html = "") => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el as unknown as HTMLElement;
};
const wrapperCount = (el: HTMLElement) => el.querySelectorAll(`.${FIELD_FS_CLASS}`).length;
const theWrapper = (el: HTMLElement) => el.querySelector(`.${FIELD_FS_CLASS}`) as HTMLElement;

describe("Jocelyne : la taille doit s'appliquer, même sur un texte centré", () => {
  test("cas nominal : une enveloppe, la bonne taille", () => {
    const el = field("Grand-parent");
    applyFieldFontSize(el, "--rt-fs-d", "32px");
    assert.equal(wrapperCount(el), 1);
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-d"), "32px");
    assert.equal(el.textContent, "Grand-parent");
  });

  test("LE BUG : enveloppe déplacée par un centrage, on ne l'empile pas", () => {
    const el = field(
      '<div style="text-align: center;">' +
        '<div class="rt-field-fs" style="--rt-fs-d: 32px;">Grand-parent</div>' +
        "</div>",
    );
    applyFieldFontSize(el, "--rt-fs-d", "48px");
    assert.equal(wrapperCount(el), 1, "une SEULE enveloppe, jamais deux");
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-d"), "48px");
    assert.ok(el.innerHTML.includes("text-align: center"), "le centrage doit survivre");
    assert.equal(el.textContent, "Grand-parent");
  });

  test("un champ DÉJÀ cassé se répare tout seul", () => {
    const el = field(
      '<div class="rt-field-fs" style="--rt-fs-d: 48px;">' +
        '<div style="text-align: center;">' +
        '<div class="rt-field-fs" style="--rt-fs-d: 32px;">Grand-parent</div>' +
        "</div></div>",
    );
    applyFieldFontSize(el, "--rt-fs-d", "56px");
    assert.equal(wrapperCount(el), 1);
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-d"), "56px");
  });

  test("ce que le menu affiche == ce que l'écran rend", () => {
    // C'est exactement ce qui divergeait : le menu lisait l'enveloppe
    // externe, le CSS appliquait l'interne.
    const el = field(
      '<div style="text-align: center;">' +
        '<div class="rt-field-fs" style="--rt-fs-d: 32px;">X</div></div>',
    );
    assert.equal(readFieldFontSize(el, "--rt-fs-d"), "32px", "on lit la taille VUE");
    applyFieldFontSize(el, "--rt-fs-d", "40px");
    assert.equal(readFieldFontSize(el, "--rt-fs-d"), "40px");
  });
});

describe("Les deux devices restent indépendants", () => {
  test("changer le desktop ne touche pas au mobile", () => {
    const el = field('<div class="rt-field-fs" style="--rt-fs-m: 20px; --rt-fs-d: 40px;">X</div>');
    applyFieldFontSize(el, "--rt-fs-d", "64px");
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-m"), "20px");
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-d"), "64px");
  });

  test("retour à Auto sur le seul device réglé : plus d'enveloppe du tout", () => {
    const el = field('<div class="rt-field-fs" style="--rt-fs-d: 40px;">Texte</div>');
    applyFieldFontSize(el, "--rt-fs-d", null);
    assert.equal(wrapperCount(el), 0);
    assert.equal(el.innerHTML, "Texte");
  });

  test("retour à Auto desktop quand mobile est réglé : l'enveloppe reste", () => {
    const el = field('<div class="rt-field-fs" style="--rt-fs-m: 20px; --rt-fs-d: 40px;">X</div>');
    applyFieldFontSize(el, "--rt-fs-d", null);
    assert.equal(wrapperCount(el), 1);
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-m"), "20px");
    assert.equal(theWrapper(el).style.getPropertyValue("--rt-fs-d"), "");
  });
});

describe("Aucune accumulation dans le DOM", () => {
  test("dix changements d'affilée laissent une seule enveloppe", () => {
    const el = field("Texte");
    for (const size of [...FIELD_FONT_SIZES].slice(0, 10)) {
      applyFieldFontSize(el, "--rt-fs-d", size);
    }
    assert.equal(wrapperCount(el), 1);
    assert.equal(el.textContent, "Texte");
  });
});
