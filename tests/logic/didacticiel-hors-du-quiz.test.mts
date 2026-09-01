// tests/logic/didacticiel-hors-du-quiz.test.mts
//
// Béné, 1er septembre 2026, en ouvrant le quiz en ligne d'un client :
// "le didacticiel s'ouvre sur la version en ligne du quiz putain !! Le
// didacticiel ne concerne PAS les visiteurs de quiz !!"
//
// Elle a raison, et la cause est celle qui revient : DEUX LISTES
// d'exceptions, tenues séparément, qui ne disaient pas la même chose.
// Le CoachWidget nommait "/q/", le TutorialOverlay non. L'écran gris du
// didacticiel s'ouvrait donc par dessus le quiz d'une cliente, chez ses
// visiteurs.
//
// Et le pathname ne suffisait pas : sur le domaine perso d'une
// créatrice, le middleware réécrit vers `/s/<slug>` et le
// `usePathname()` du navigateur rend le chemin que le VISITEUR a tapé.
// C'est exactement le piège de `affiliate.tipote.com` (8 juin), un cran
// plus loin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { estNotreHote, estSurfacePublique } from "../../lib/nav/surfacePublique.ts";

// ── Ce qu'elle a vu ──────────────────────────────────────────────────

test("le viewer public d'un quiz est une surface de VISITEUR", () => {
  assert.equal(estSurfacePublique("/q/chemindepuissance", "app.tipote.com"), true);
  assert.equal(estSurfacePublique("/q/mon-quiz?x=1", "app.tipote.com"), true);
});

test("les autres écrans publics aussi", () => {
  for (const chemin of ["/s/mon-quiz", "/pq/abc", "/p/abc", "/depart/xyz"]) {
    assert.equal(estSurfacePublique(chemin, "app.tipote.com"), true, chemin);
  }
});

test("le tableau de bord et l'éditeur gardent leur didacticiel", () => {
  for (const chemin of ["/dashboard", "/contents", "/quiz/123", "/quiz/123/analytics", "/settings"]) {
    assert.equal(estSurfacePublique(chemin, "app.tipote.com"), false, chemin);
  }
});

// ── LE PIÈGE DU DOMAINE PERSO ────────────────────────────────────────

test("sur le domaine d'une créatrice, TOUT est public, quel que soit le chemin", () => {
  // Le middleware y réécrit vers /s/<slug>, mais le navigateur rend le
  // chemin tapé par le visiteur : le pathname seul ne voit rien.
  assert.equal(estSurfacePublique("/mon-quiz", "quiz.macliente.fr"), true);
  assert.equal(estSurfacePublique("/", "quiz.macliente.fr"), true);
});

test("nos domaines restent les nôtres", () => {
  for (const h of ["app.tipote.com", "affiliate.tipote.com", "tipote.com", "localhost:3000", "127.0.0.1"]) {
    assert.equal(estNotreHote(h), true, h);
  }
  for (const h of ["quiz.macliente.fr", "mauricemassolin.com", "tipote.com.exemple.fr"]) {
    assert.equal(estNotreHote(h), false, h);
  }
});

test("un host inconnu ne fait RIEN conclure", () => {
  // Mieux vaut se rabattre sur le chemin que masquer le didacticiel de
  // tout le monde parce qu'un en-tête manquait.
  assert.equal(estNotreHote(null), true);
  assert.equal(estSurfacePublique("/dashboard", null), false);
  assert.equal(estSurfacePublique("/q/abc", null), true);
});

// ── Les garde-fous qui empêchent le retour du bug ────────────────────

test("les deux widgets passent par la MÊME règle", () => {
  for (const f of [
    "components/tutorial/TutorialOverlay.tsx",
    "components/coach/CoachWidget.tsx",
    "components/Providers.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /estSurfacePublique\(/, `${f} ne consulte pas la règle commune`);
  }
});

test("Providers ne monte plus le chrome sur une surface publique", () => {
  const src = readFileSync("components/Providers.tsx", "utf8");
  assert.match(
    src,
    /!isAffiliateSpace\s*&&\s*!surfacePublique/,
    "le didacticiel et le coach sont remontés sur toutes les pages",
  );
});

test("le root layout passe bien le host, sinon le domaine perso n'est pas vu", () => {
  const src = readFileSync("app/layout.tsx", "utf8");
  assert.match(src, /host=\{hostHeader\}/);
});
