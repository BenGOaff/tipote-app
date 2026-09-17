// tests/logic/un-seul-endroit-capture.test.mts
//
// UN SEUL ENDROIT POUR TOUT CE QU'ON DEMANDE AU VISITEUR (Béné,
// 17 septembre 2026).
//
// « Pour les infos demandées : un seul endroit où on trouve TOUT :
// prénom, nom, téléphone, champ personnalisé etc. » La colonne portait
// DEUX blocs pour la même question : une rangée de pastilles pour les
// champs intégrés, puis une section « Champs personnalisés » avec son
// titre, son explication, ses cartes et son propre bouton d'ajout. Elle a
// aussi demandé de retirer l'explication (« ça c'est notre tambouille
// interne, l'user s'en fout ») et de mettre le nom d'un champ à la MÊME
// taille que le reste de la colonne (il était en 14px au milieu de 12px).
//
// Et ce bloc était RECOPIÉ dans les quatre éditeurs (quiz et sondage, des
// deux dépôts). Une règle recopiée finit toujours par en oublier un : le
// pilote du prénom demandé à l'accueil n'existait que côté quiz, et Tipote
// y portait un libellé écrit EN DUR EN FRANÇAIS dans une interface qui
// existe en 7 langues.
//
// Ce test tient le FAIT, jamais la formulation : une rangée, un bouton
// d'ajout qui ajoute vraiment un champ personnalisé, une seule taille de
// texte, et le même composant partout.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CHEMIN_EDITEUR_CAPTURE, SOURCE_EDITEUR_CAPTURE } from "./aide/editeurCapture.mts";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const LANGUES = ["fr", "en", "es", "it", "pt", "pt-BR", "ar"];
const EDITEURS = ["components/quiz/QuizDetailClient.tsx", "components/quiz/SurveyDetailClient.tsx"];

const lire = (p: string) => readFileSync(p, "utf8");
const messages = (lang: string) => {
  const d = JSON.parse(lire(`messages/${lang}.json`));
  return d.quizEditor ?? d.quizDetail;
};

test("une SEULE rangée : un champ personnalisé est une pastille comme les autres", () => {
  const src = sansCommentaires(SOURCE_EDITEUR_CAPTURE);
  const rangees = (src.match(/flex flex-wrap/g) ?? []).length;
  assert.equal(rangees, 1, `${CHEMIN_EDITEUR_CAPTURE} : ${rangees} rangées de pastilles, il en faut UNE`);
  // Les deux familles passent par le MÊME rendu : deux composants de
  // pastille finiraient par ne plus se ressembler, et la créatrice
  // relirait deux listes au lieu d'une.
  assert.match(src, /integres\.map\(/, "les champs intégrés ne sont plus une liste");
  assert.match(src, /champs\.map\(/, "les champs personnalisés ne sont plus une liste");
  const deb = src.indexOf("flex flex-wrap");
  const fin = src.indexOf("</div>", deb);
  const rangee = src.slice(deb, fin);
  assert.match(rangee, /integres\.map\(/, "les champs intégrés sont sortis de la rangée");
  assert.match(rangee, /champs\.map\(/, "les champs personnalisés ne sont pas dans la rangée");
});

test("le bouton d'ajout ajoute un champ PERSONNALISÉ, il ne rallume pas un champ intégré", () => {
  const src = sansCommentaires(SOURCE_EDITEUR_CAPTURE);
  // L'ancien « Ajouter un élément » rallumait le premier champ intégré
  // éteint, c'est à dire exactement ce que fait déjà la pastille en
  // pointillés juste au dessus : deux gestes pour une seule chose.
  assert.match(src, /const ajouter = \(\) => \{[\s\S]*?nouvelIdChamp\(/, "le bouton n'ajoute plus de champ personnalisé");
  const bouton = src.slice(src.indexOf('onClick={ajouter}'), src.indexOf('t("addField")') + 20);
  assert.ok(bouton.length > 0 && bouton.includes('t("addField")'), "le bouton d'ajout ne porte plus le libellé traduit");
  assert.equal(/setActif\?\.\(true\)/.test(src), false, "le bouton rallume encore un champ intégré");
});

test("chaque champ affiché a SA case obligatoire, personnalisé compris", () => {
  const src = sansCommentaires(SOURCE_EDITEUR_CAPTURE);
  assert.match(src, /c\.setObligatoire\(e\.target\.checked\)/, "les champs intégrés ont perdu leur case");
  assert.match(src, /required: e\.target\.checked/, "les champs personnalisés ont perdu leur case");
});

test("l'astérisque se CALCULE : aucun libellé de pastille ne la porte figée", () => {
  // « Nom* » était écrit dans la traduction alors que le nom n'est
  // obligatoire que si la case est cochée : la pastille annonçait une
  // contrainte que le visiteur ne subissait pas.
  assert.match(sansCommentaires(SOURCE_EDITEUR_CAPTURE), /avecEtoile\(/, "l'étoile ne se calcule plus");
  for (const lang of LANGUES) {
    const ns = messages(lang);
    for (const k of ["fieldEmail", "fieldFirstName", "fieldLastName", "fieldPhone", "fieldCountry"]) {
      assert.equal(typeof ns[k], "string", `${lang}.${k}`);
      assert.equal(ns[k].includes("*"), false, `${lang}.${k} porte une étoile figée : "${ns[k]}"`);
    }
  }
});

test("la tambouille interne ne s'affiche plus, dans aucune langue", () => {
  const src = SOURCE_EDITEUR_CAPTURE;
  for (const k of ["customFieldsTitle", "customFieldsHint"]) {
    assert.equal(src.includes(k), false, `la colonne sert encore ${k}`);
    for (const lang of LANGUES) {
      assert.equal(messages(lang)[k], undefined, `${lang}.${k} est resté dans les traductions`);
    }
  }
});

test("tout est écrit à la MÊME taille dans la colonne", () => {
  // Le nom d'un champ personnalisé était en `text-sm` (14px) au milieu
  // d'une colonne écrite en `text-xs` (12px).
  const src = sansCommentaires(SOURCE_EDITEUR_CAPTURE);
  assert.equal(/\btext-sm\b/.test(src), false, `${CHEMIN_EDITEUR_CAPTURE} : un texte en 14px dans une colonne en 12px`);
});

test("les deux éditeurs appellent le composant et n'ont plus leur propre rangée", () => {
  for (const p of EDITEURS) {
    const src = lire(p);
    assert.match(src, /<ChampsCaptureEditor/, `${p} : le composant partagé`);
    assert.equal(src.includes("CapturePill"), false, `${p} : la rangée de pastilles est encore recopiée ici`);
    // AUCUN appelant n'écrit de phrase : le composant résout ses libellés
    // lui même. Tipote passait "Prénom (demandé au début)" EN DUR, en
    // français, dans une interface qui existe en 7 langues.
    const appel = src.slice(src.indexOf("<ChampsCaptureEditor"), src.indexOf("<ChampsCaptureEditor") + 1500);
    assert.equal(/(label|libelle)/i.test(appel.slice(0, appel.indexOf("/>"))), false, `${p} : un libellé traverse encore en prop`);
  }
});

test("le libellé du prénom déjà demandé à l'accueil est TRADUIT, dans les 7 langues", () => {
  assert.match(sansCommentaires(SOURCE_EDITEUR_CAPTURE), /t\("fieldFirstNameFromIntro"\)/, "le libellé verrouillé est écrit en dur");
  for (const lang of LANGUES) {
    assert.equal(typeof messages(lang).fieldFirstNameFromIntro, "string", `${lang}.fieldFirstNameFromIntro`);
  }
});

test("le composant est identique à l'octet près chez le jumeau", () => {
  const rel = CHEMIN_EDITEUR_CAPTURE.replace(/^[/\\]/, "");
  const ici = resolve(rel);
  const jumeau = ["../tiquiz/" + rel, "../tipote-app/" + rel]
    .map((p) => resolve(p))
    .find((p) => p !== ici && existsSync(p));
  if (!jumeau) return; // l'autre dépôt n'est pas monté ici
  assert.equal(readFileSync(ici, "utf8"), readFileSync(jumeau, "utf8"), `${rel} a divergé entre les deux dépôts`);
});
