// tests/logic/editor-chrome.test.mts
//
// Jocelyne, 3 août 2026 : "je voudrais grossir les polices sur les
// boutons, mais ce n'est pas possible, menu déroulant vide."
//
// Le menu n'était pas vide : il s'ouvrait avec ses 11 tailles, écrites
// en BLANC sur un panneau BLANC. L'éditeur est du WYSIWYG, donc la
// toolbar vit à l'intérieur de l'aperçu, donc à l'intérieur du
// `<button class="text-white">` du CTA. Les entrées du menu n'avaient
// aucune classe de couleur : elles héritaient du blanc. Seul l'en-tête,
// qui porte `text-muted-foreground`, restait visible. Un menu avec un
// titre et rien dessous.
//
// C'est un bug de CSS, que ni le filet visuel (il photographie le viewer
// public, pas l'éditeur) ni le typecheck ne pouvaient voir. Ce test
// vérifie donc ce qui est vérifiable sans navigateur : que la coupure
// d'héritage existe, qu'elle est posée à la RACINE du chrome, et qu'elle
// ne se raccroche pas à la variable que l'aperçu réécrit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const rte = readFileSync(join(ROOT, "components", "ui", "rich-text-edit.tsx"), "utf8");

/** Corps de la règle `.rt-chrome { ... }`. */
function rtChromeBlock(): string {
  const start = css.indexOf(".rt-chrome {");
  assert.notEqual(start, -1, ".rt-chrome doit exister dans globals.css");
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

test("la racine de la toolbar porte rt-chrome", () => {
  // Signature de la racine : c'est le seul élément sticky de l'éditeur.
  // Si quelqu'un restructure la toolbar, ce test tombe et le renvoie
  // lire pourquoi la classe est là plutôt que de la perdre en route.
  const root = rte
    .split("\n")
    .find((l) => l.includes("sticky top-2") && l.includes("className="));
  assert.ok(root, "racine de toolbar introuvable (sticky top-2)");
  assert.ok(
    root.includes("rt-chrome"),
    "la racine de la toolbar doit porter rt-chrome, sinon les menus héritent du style de l'aperçu",
  );
});

test("rt-chrome coupe bien les propriétés HÉRITÉES qui cassent la lisibilité", () => {
  const block = rtChromeBlock();
  // La couleur est celle qui a produit le bug ; les autres sont de la
  // même famille (un aperçu en majuscules ou en gras déforme le menu
  // sans le rendre invisible, mais le rend illisible).
  for (const prop of ["color:", "font-size:", "font-weight:", "text-transform:", "letter-spacing:", "text-align:"]) {
    assert.ok(block.includes(prop), `rt-chrome doit neutraliser ${prop}`);
  }
});

test("rt-chrome n'utilise PAS --foreground", () => {
  // Le piège suivant, et il est vicieux : l'aperçu de l'éditeur réécrit
  // --foreground avec la couleur de texte choisie par la créatrice
  // (QuizDetailClient, sur le <main> du preview). S'y raccrocher
  // ramènerait exactement le même bug pour toute créatrice ayant choisi
  // un texte clair.
  const block = rtChromeBlock();
  assert.ok(
    !block.includes("var(--foreground)"),
    "rt-chrome doit utiliser --rt-chrome-fg, que l'aperçu ne réécrit jamais",
  );
  assert.ok(block.includes("var(--rt-chrome-fg)"));
});

test("--rt-chrome-fg est défini en clair ET en sombre", () => {
  // Défini d'un seul côté = chrome invisible dans l'autre thème.
  assert.ok(/:root\s*\{[\s\S]*?--rt-chrome-fg:/.test(css), "--rt-chrome-fg manquant sur :root");
  assert.ok(/\.dark\s*\{[\s\S]*?--rt-chrome-fg:/.test(css), "--rt-chrome-fg manquant sur .dark");
});

test("rt-chrome ne passe pas en force sur les classes des enfants", () => {
  // `!important` ici écraserait text-xs / text-muted-foreground des
  // boutons de la toolbar : on coupe l'héritage, on ne réécrit pas le
  // style de chacun.
  assert.ok(!rtChromeBlock().includes("!important"));
});
