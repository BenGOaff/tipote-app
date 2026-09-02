// tests/logic/didacticiel-hors-du-quiz.test.mts
//
// LE CHROME DE L'APP NE S'AFFICHE JAMAIS CHEZ UN VISITEUR.
//
// Béné l'a signalé DEUX JOURS DE SUITE, sur deux écrans différents :
// le 1er septembre sur le quiz public, le 2 sur le centre d'aide. Les
// deux fois, la cause était une liste d'EXCEPTIONS qui oubliait le
// dernier écran public ajouté.
//
// Ce filet ne vérifie donc pas « /support est bien exclu » : il vérifie
// que le SENS de la règle est le bon, c'est à dire que tout ce qui n'est
// pas nommé comme un écran d'app est public.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PREFIXES_APP,
  cheminDeLApp,
  estNotreHote,
  estSurfacePublique,
} from "@/lib/nav/surfacePublique";

// ---------------------------------------------------------------------
// LE SENS DE LA RÈGLE.
// ---------------------------------------------------------------------

test("tout ce qui n'est pas un écran d'app est PUBLIC par défaut", () => {
  // C'est la correction du 2 septembre. Avant, un écran public non
  // nommé montrait le didacticiel ; maintenant il ne peut plus.
  for (const inconnu of [
    "/support",
    "/support/comment-creer-un-quiz",
    "/legal/cgv",
    "/partage/abc123",
    "/help/seo",
    "/depart/xyz",
    "/un-ecran-public-qui-n-existe-pas-encore",
    "/",
    "/login",
  ]) {
    assert.equal(estSurfacePublique(inconnu, "app.tipote.com"), true, inconnu);
  }
});

test("le centre d'aide, nommément", () => {
  // "le didacticiel Tipote s'affiche sur le centre d'aide PUTAIN !!"
  assert.equal(estSurfacePublique("/support", "app.tipote.com"), true);
  assert.equal(estSurfacePublique("/support", null), true);
  assert.equal(cheminDeLApp("/support"), false);
});

test("le viewer public, nommément", () => {
  // Le retour de la veille, qui doit rester corrigé.
  for (const p of ["/q/mon-quiz", "/s/mon-quiz", "/pq/abc", "/p/ma-page"]) {
    assert.equal(estSurfacePublique(p, "app.tipote.com"), true, p);
  }
});

test("les écrans de l'app gardent leur didacticiel", () => {
  // L'autre moitié : une règle qui masque tout ne sert à rien non plus.
  for (const p of [
    "/dashboard",
    "/contents",
    "/contents/42",
    "/quiz/42",
    "/create/quiz",
    "/strategy/phase-1",
    "/settings",
    "/generateurs/bonus",
    "/leads",
  ]) {
    assert.equal(estSurfacePublique(p, "app.tipote.com"), false, p);
  }
});

test("on compare par SEGMENT, jamais par début de chaîne", () => {
  // `/quizzes-publics` ne doit pas être pris pour `/quiz`.
  assert.equal(cheminDeLApp("/quiz"), true);
  assert.equal(cheminDeLApp("/quiz/42"), true);
  assert.equal(cheminDeLApp("/quizzes-publics"), false);
  assert.equal(cheminDeLApp("/appartement"), false);
  assert.equal(cheminDeLApp("/app"), true);
});

// ---------------------------------------------------------------------
// LE HOST : le pathname seul est mort sur un domaine perso.
// ---------------------------------------------------------------------

test("un domaine qui n'est pas le nôtre ne sert que du public", () => {
  // Sur `exemple.fr`, le middleware réécrit vers `/s/<slug>` mais le
  // navigateur rend `/mon-quiz`. Sans le host, le gate est mort.
  assert.equal(estSurfacePublique("/mon-quiz", "exemple.fr"), true);
  assert.equal(estSurfacePublique("/dashboard", "exemple.fr"), true);
  assert.equal(estNotreHote("exemple.fr"), false);
  assert.equal(estNotreHote("app.tipote.com"), true);
  assert.equal(estNotreHote("affiliate.tipote.com"), true);
  assert.equal(estNotreHote("localhost:3000"), true);
});

test("un host inconnu ne fait conclure à RIEN", () => {
  // Le coût d'une erreur est asymétrique : un host à nous pris pour un
  // domaine perso masque un didacticiel, un domaine perso pris pour le
  // nôtre affiche un écran d'admin chez les visiteurs d'une cliente.
  assert.equal(estNotreHote(null), true);
  assert.equal(estNotreHote(""), true);
  assert.equal(estSurfacePublique("/dashboard", null), false);
});

// ---------------------------------------------------------------------
// PLUS DE DEUXIÈME LISTE.
// ---------------------------------------------------------------------

test("le coach ne tient plus sa propre liste de surfaces publiques", () => {
  // C'est la cause des deux signalements : trois listes des mêmes
  // chemins, tenues séparément.
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/coach/CoachWidget.tsx"),
    "utf8",
  );
  const liste = /const HIDDEN_PREFIXES = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
  for (const public_ of ["/q/", "/p/", "/support", "/legal", "/auth", "/onboarding"]) {
    assert.ok(!liste.includes(`"${public_}"`), `le coach renomme « ${public_} » dans sa propre liste`);
  }
  assert.ok(src.includes("estSurfacePublique"), "le coach n'appelle plus la règle commune");
});

test("les deux widgets passent par la MÊME fonction", () => {
  for (const f of ["components/coach/CoachWidget.tsx", "components/tutorial/TutorialOverlay.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.ok(src.includes("estSurfacePublique"), `${f} décide tout seul`);
  }
  // Et le montage aussi : le composant qui les rend ne doit pas les
  // monter du tout sur une surface publique.
  const prov = fs.readFileSync(path.join(process.cwd(), "components/Providers.tsx"), "utf8");
  assert.ok(prov.includes("estSurfacePublique"));
});

test("les écrans protégés du middleware sont tous des écrans d'app", () => {
  // Les deux listes ne peuvent pas se contredire : un chemin derrière
  // connexion qui ne serait pas un écran d'app serait un écran sans
  // didacticiel, sans qu'on comprenne pourquoi.
  const mid = fs.readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
  const bloc = /const PROTECTED_PREFIXES = \[([\s\S]*?)\];/.exec(mid)?.[1] ?? "";
  const proteges = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(proteges.length >= 15, "la liste du middleware n'a pas été lue");
  for (const p of proteges) {
    assert.ok(PREFIXES_APP.includes(p), `${p} est protégé par le middleware mais absent de PREFIXES_APP`);
  }
});
