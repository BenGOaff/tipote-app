// tests/logic/statut-toggle.test.mts
//
// Retour client, 16 septembre 2026 : "clarifier le bouton 'publier' d'un
// quiz : remplacer par target : actif - désactivé avec vert sur activé et
// grisé sur désactivé. Plus simple, plus compréhensible."
//
// Le bouton "Publier" disait un GESTE, et il fallait deviner l'etat en
// lisant le libelle. L'interrupteur dit l'ETAT. Ce test tient : le
// composant existe et est le MEME dans les deux depots, les deux editeurs
// l'appellent, aucun bouton "Publier" ne reste en tete d'editeur, et les
// 7 langues portent les deux etats.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (p: string) => sansCommentaires(readFileSync(p, "utf8"));

test("l'interrupteur est un switch accessible, vert quand actif, gris sinon", () => {
  const src = lire("components/quiz/StatutToggle.tsx");
  assert.ok(src.includes('role="switch"') && src.includes("aria-checked={actif}"));
  assert.ok(/actif\s*\?\s*"bg-emerald-500/.test(src), "vert sur actif");
  assert.ok(/:\s*"bg-muted/.test(src), "gris sur desactive");
  assert.ok(src.includes("{actif ? libelles.on : libelles.off}"), "le libelle dit l'ETAT");
});

test("le curseur est borne DANS le rail : un left explicite, jamais la position statique (capture Bene, 16 septembre 2026)", () => {
  // Sans `left`, un element `absolute` garde sa position statique, et dans
  // un rail `inline-block` pose dans un bouton `inline-flex` elle n'est pas
  // le bord du rail : le curseur blanc se posait SUR le mot "Actif".
  const src = lire("components/quiz/StatutToggle.tsx");
  const curseur = src.match(/<span\s+className=\{`absolute[^`]*`\}/);
  assert.ok(curseur, "le curseur est le span absolute");
  assert.ok(/\bleft-0\.5\b/.test(curseur![0]), "le curseur porte left-0.5, comme le SettingsToggle qui marche");
  assert.ok(!/translate-x-0\.5/.test(curseur![0]), "la position de repos vient du left, pas d'un translate qui s'ajoute a la position statique");
  // Le libelle ne se coupe pas : c'est lui que Bene ne voyait plus.
  assert.ok(/className="whitespace-nowrap">\{actif \? libelles\.on : libelles\.off\}/.test(src), "le libelle est en nowrap");
});

test("les deux editeurs l'appellent, et plus aucun bouton Publier ne reste en tete", () => {
  for (const p of ["components/quiz/QuizDetailClient.tsx", "components/quiz/SurveyDetailClient.tsx"]) {
    const src = lire(p);
    assert.ok(src.includes("<StatutToggle"), `${p} : l'interrupteur`);
    assert.ok(src.includes('actif={status === "active"}'), `${p} : l'etat vient du statut`);
    assert.ok(src.includes("onToggle={handleToggleStatus}"), `${p} : le MEME gestionnaire qu'avant (PATCH, toast, confettis)`);
    assert.ok(!src.includes('t("deactivate") : t("publish")'), `${p} : l'ancien bouton a disparu`);
  }
});

test("les 7 langues portent Actif et Desactive, sans tiret cadratin, et l'aide du lien ne dit plus Publier", () => {
  for (const lang of ["fr", "en", "es", "it", "pt", "pt-BR", "ar"]) {
    const d = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
    const ns = d.quizEditor ?? d.quizDetail;
    // Le toast d'activation ne porte pas le meme nom dans les deux depots
    // (quizPublished chez Tiquiz, toastPublished chez Tipote) : on vise le FAIT,
    // il dit "active" et plus "publie".
    const toast = ns.quizPublished ?? ns.toastPublished;
    assert.equal(typeof toast, "string", `${lang} : le toast d'activation`);
    assert.ok(!/publi[ée]|published|publicado|pubblicato|نشر/i.test(toast), `${lang} : le toast dit encore "publie" : ${toast}`);
    for (const k of ["statusOn", "statusOff", "statusOnHint", "statusOffHint", "mustPublishHint"]) {
      assert.equal(typeof ns[k], "string", `${lang}.${k}`);
      assert.ok(!/[—–]/.test(ns[k]), `${lang}.${k} porte un tiret cadratin`);
    }
    assert.notEqual(ns.statusOn, ns.statusOff);
  }
  const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"));
  const ns = fr.quizEditor ?? fr.quizDetail;
  assert.ok(!/Clique sur Publier/.test(ns.mustPublishHint), "l'aide renvoie a l'interrupteur, pas a un bouton qui n'existe plus");
});
