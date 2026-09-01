// tests/logic/nom-du-profil.test.mts
//
// Christian, 1er septembre 2026 : "les différents résultats
// n'apparaissent pas sous les réponses. Seuls apparaissent « Résultat 1,
// Résultat 2 » etc."
//
// Le menu posé sous chaque réponse de l'éditeur JETAIT le profil :
//
//   editResults.map((_, ri) => <option>{t("previewResult", {n: ri+1})}</option>)
//                     ^^^
//
// Aucun titre ne pouvait donc s'afficher, si bien écrit soit-il. Et sur
// un quiz à six profils, "Résultat 4" ne dit rien : on branche ses
// réponses au hasard.
//
// La composition qui produit le bon libellé existait DÉJÀ, recopiée à la
// main dans quatre autres endroits du même fichier. Deux ne l'ont jamais
// eue. Elle vit maintenant dans `lib/quiz/resultLabel.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resultChoiceLabel } from "../../lib/quiz/resultLabel.ts";

test("un profil nommé s'affiche par son NOM, jamais par son rang", () => {
  assert.equal(resultChoiceLabel("Le Solopreneur Invisible", "Résultat 1"), "Le Solopreneur Invisible");
});

test("un profil sans titre garde un libellé choisissable", () => {
  // Sans repli, le menu aurait des entrées vides : on ne peut plus rien
  // distinguer, ce qui est pire que "Résultat 3".
  assert.equal(resultChoiceLabel("", "Résultat 3"), "Résultat 3");
  assert.equal(resultChoiceLabel(null, "Résultat 3"), "Résultat 3");
  assert.equal(resultChoiceLabel("   ", "Résultat 3"), "Résultat 3");
});

test("le HTML de mise en forme ne sort pas dans un menu", () => {
  // Un <option> ne rend pas de HTML : il afficherait les balises.
  assert.equal(resultChoiceLabel("<b>Le Bâtisseur</b>", "Résultat 2"), "Le Bâtisseur");
});

test("les placeholders sont interpolés à VIDE, jamais montrés", () => {
  const libelle = resultChoiceLabel("{name}, tu es le Stratège", "Résultat 1");
  assert.ok(!libelle.includes("{name}"), libelle);
  assert.ok(libelle.startsWith("Stratège") || libelle.includes("Stratège"), libelle);
});

test("la phrase conversationnelle est retirée, le label court reste", () => {
  assert.equal(resultChoiceLabel("Tu es le Perfectionniste", "Résultat 1"), "Perfectionniste");
});

test("un titre dont il ne reste RIEN après nettoyage retombe sur le repli", () => {
  // Sinon le menu porterait une entrée vide, invisible et incliquable.
  assert.equal(resultChoiceLabel("<p></p>", "Résultat 5"), "Résultat 5");
});

test("une entité HTML est décodée, pas affichée brute", () => {
  assert.equal(resultChoiceLabel("Ton mode&nbsp;: Rapide", "Résultat 1").replace(/\s+/g, " "), "Ton mode : Rapide");
});

// ── Le garde-fou qui empêche le retour du bug ────────────────────────

test("l'éditeur ne réécrit plus la composition à la main", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../../components/quiz/QuizDetailClient.tsx", import.meta.url),
    "utf8",
  );
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  assert.ok(
    !/editResults\.map\(\(_, ri\) => <option/.test(code),
    "le menu sous les réponses jette de nouveau le profil : c'est exactement le bug de Christian",
  );
  // On vise la composition SUIVIE D'UN REPLI, c'est à dire un LIBELLÉ
  // montré à la créatrice. EXCEPTION ASSUMÉE : `titleForVisual` compose
  // les deux mêmes fonctions pour le titre d'une IMAGE générée, sans
  // repli et avec sa propre capitalisation. Ce n'est pas un libellé
  // d'interface, et le confondre casserait la génération d'images.
  assert.ok(
    !/extractResultLabel\(cleanPlaceholdersForLabel\([^\n]*\)\)\)\s*\|\|/.test(code),
    "un libellé recompose la règle à la main au lieu d'appeler resultChoiceLabel",
  );
  assert.ok(code.includes("resultChoiceLabel("), "l'éditeur doit appeler resultChoiceLabel");
});

test("aucun libellé de repli n'est écrit en français dans le code", () => {
  // L'interface existe en 7 langues : un `Résultat ${n}` en dur montre du
  // français à une créatrice espagnole ou arabe.
  return import("node:fs/promises").then(async ({ readFile }) => {
    const src = await readFile(
      new URL("../../components/quiz/QuizDetailClient.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(!src.includes("`Résultat ${"), "un repli français en dur est revenu dans l'éditeur");
  });
});
