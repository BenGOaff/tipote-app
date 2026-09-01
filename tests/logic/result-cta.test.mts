// tests/logic/result-cta.test.mts
//
// Béné, 25 août 2026 : "On vire le CTA par défaut : il faut remplir pour
// chaque profil point barre. Si rien = pas de CTA." Et, sur le risque :
// "fais attention à ne pas réécrire un CTA qui a été créé directement
// dans l'éditeur du quiz."
//
// LE PIÈGE QUE CE FICHIER FIGE : le repli ne portait pas que le libellé,
// il portait aussi l'ADRESSE, et c'est l'adresse qui décide si le bouton
// EXISTE. Retirer le repli sans recopier ferait disparaître le bouton de
// tout quiz en ligne dont les profils n'ont pas leur propre adresse. Sur
// la page qui vend.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { profilsSansCta, resolveResultCta } from "../../lib/quiz/resultCta.ts";

// ── La mécanique est un PARAMÈTRE ───────────────────────────────────

test("en profil, le CTA du quiz n'est JAMAIS consulte", () => {
  const r = resolveResultCta("profil", {
    profilTexte: null,
    profilUrl: null,
    quizTexte: "Voir l'offre",
    quizUrl: "https://exemple.fr",
  });
  assert.deepEqual(r, { url: null, texte: null }, "c'est tout l'objet du changement");
});

test("en sondage, le CTA du quiz est le SEUL qui existe", () => {
  // L'ecran de remerciement d'un sondage n'a pas de profil. Supprimer le
  // CTA du quiz la-bas casserait le bouton de TOUS les sondages.
  const r = resolveResultCta("sondage", {
    quizTexte: "Voir l'offre",
    quizUrl: "https://exemple.fr",
  });
  assert.deepEqual(r, { url: "https://exemple.fr", texte: "Voir l'offre" });
});

test("le profil rempli est rendu tel quel", () => {
  const r = resolveResultCta("profil", {
    profilTexte: "Mon offre",
    profilUrl: "https://profil.fr",
    quizUrl: "https://quiz.fr",
  });
  assert.deepEqual(r, { url: "https://profil.fr", texte: "Mon offre" });
});

// ── "Si rien = pas de CTA" ──────────────────────────────────────────

test("pas d'adresse, pas de bouton", () => {
  assert.equal(resolveResultCta("profil", {}).url, null);
  assert.equal(resolveResultCta("sondage", {}).url, null);
});

test("une adresse d'espaces ne fait pas un bouton", () => {
  for (const vide of ["", "   ", "\n", "\t "]) {
    assert.equal(resolveResultCta("profil", { profilUrl: vide }).url, null, JSON.stringify(vide));
  }
});

test("une adresse sans libelle garde son bouton", () => {
  // Le libelle generique traduit est pose par l'appelant : `null` veut
  // dire "mets le tien", pas "pas de bouton".
  const r = resolveResultCta("profil", { profilUrl: "https://exemple.fr" });
  assert.equal(r.url, "https://exemple.fr");
  assert.equal(r.texte, null);
});

// ── Ce qu'on PROPOSE, et qu'on ne fait jamais en douce ──────────────

test("on compte les profils qui perdraient leur bouton", () => {
  const profils = [{ cta_url: "https://a.fr" }, { cta_url: null }, { cta_url: "  " }];
  assert.equal(profilsSansCta("https://quiz.fr", profils), 2);
});

test("sans CTA de quiz, il n'y a rien a proposer", () => {
  // Pas de repli a reprendre : ces profils n'ont jamais eu de bouton.
  assert.equal(profilsSansCta(null, [{ cta_url: null }, { cta_url: null }]), 0);
  assert.equal(profilsSansCta("   ", [{ cta_url: null }]), 0);
});

test("un profil qui a DEJA son CTA n'est jamais compte", () => {
  // "Fais attention a ne pas reecrire un CTA qui a ete cree directement
  // dans l'editeur du quiz." C'est la garantie, et elle vaut aussi pour
  // la migration SQL, qui ne remplit que les champs VIDES.
  assert.equal(profilsSansCta("https://quiz.fr", [{ cta_url: "https://sien.fr" }]), 0);
});

// ── La migration ne peut pas ecraser du travail ─────────────────────

test("la migration ne remplit QUE les champs vides", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20260901_cta_par_profil.sql", import.meta.url),
    "utf8",
  );
  // Deux garde-fous, et les deux comptent : on ne touche qu'aux lignes
  // vides, et jamais aux sondages (qui n'ont pas de profil).
  assert.match(sql, /coalesce\(nullif\(btrim\(r\.cta_url\), ''\), ''\) = ''/i);
  assert.match(sql, /mode <> 'survey'/i);
  assert.match(sql, /notify pgrst/i);
});

test("le module est pur", () => {
  const src = readFileSync(new URL("../../lib/quiz/resultCta.ts", import.meta.url), "utf8");
  assert.ok(!/supabaseAdmin|process\.env|from "@supabase/.test(src));
});
