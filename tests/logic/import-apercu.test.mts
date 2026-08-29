// tests/logic/import-apercu.test.mts
//
// CE QU'ON MONTRE AVANT DE CRÉER UN AFFILIÉ PAYABLE (29 août 2026).
//
// Le 29 août, en recopiant à l'oeil une liste d'identifiants depuis un
// écran, j'en ai déformé un : `sa000833911393053305e0…` au lieu de
// `sa00083391139305a305e0…`. Les deux passent tous les contrôles de
// FORME. Sans confrontation à ses propres données, l'import aurait créé
// un affilié fantôme, avec un code public à lui, qui n'aurait jamais
// rien attribué et que personne n'aurait remarqué.

import { test } from "node:test";
import assert from "node:assert/strict";

import { annoterImport, type ActiviteSa } from "@/lib/affiliate/importApercu";

const SA_A = "sa013476947331a3b65a708ef70cabd5809b547764";
const SA_B = "sa0042128975e79936241b3444ffe3eac2b77a50cc";

function activite(entrees: Record<string, ActiviteSa>) {
  return new Map(Object.entries(entrees));
}

test("un identifiant qui a produit des clics n'est pas signalé", () => {
  const [ligne] = annoterImport(
    [{ sa: SA_A, email: "eric@exemple.fr", nom: "Eric Legrigeois" }],
    activite({ [SA_A]: { clics: 36, contacts: 0 } }),
    new Map(),
    new Set(),
  );
  assert.equal(ligne.jamaisVu, false);
  assert.equal(ligne.clics, 36);
});

test("un identifiant absent de ses données est SIGNALÉ, jamais refusé", () => {
  const [ligne] = annoterImport(
    [{ sa: SA_B, email: "steph@exemple.fr", nom: "Stéphanie Charles" }],
    activite({}),
    new Map(),
    new Set(),
  );
  // Signalé...
  assert.equal(ligne.jamaisVu, true);
  // ...et pourtant importable : un affilié tout neuf n'a rien envoyé,
  // et lui fermer la porte serait pire que le doute.
  assert.equal(ligne.code, "stephanie-charles");
});

test("un identifiant DÉJÀ dans le registre n'a plus à se justifier", () => {
  const [ligne] = annoterImport(
    [{ sa: SA_A, email: "eric@exemple.fr", nom: "Eric" }],
    activite({}),
    new Map(),
    new Set([SA_A]),
  );
  assert.equal(ligne.existant, true);
  // Il a été validé une fois : l'absence de trafic ne dit plus rien de
  // lui, et le signaler ferait crier le test pour rien.
  assert.equal(ligne.jamaisVu, false);
});

test("le code public est montré AVANT d'être écrit, il finira dans ses liens", () => {
  const lignes = annoterImport(
    [
      { sa: SA_A, email: "legrigeoiseric@gmail.com", nom: "Eric Legrigeois" },
      { sa: SA_B, email: "needy@live.fr", nom: null },
    ],
    activite({}),
    new Map(),
    new Set(),
  );
  // Son nom d'abord : c'est ce qu'il reconnaîtra dans son propre lien.
  assert.equal(lignes[0].code, "eric-legrigeois");
  // Sans nom, la partie locale de son adresse. Jamais un nom inventé :
  // un affilié qui voit un nom qu'il n'a pas donné se demande d'où on
  // le sort.
  assert.equal(lignes[1].code, "needy");
});

test("un code déjà pris par QUELQU'UN D'AUTRE est annoncé", () => {
  const pris = new Map([["eric", "saAUTRE0000000000000000000000000000000000"]]);
  const [ligne] = annoterImport(
    [{ sa: SA_A, email: "eric@exemple.fr", nom: "Eric" }],
    activite({}),
    pris,
    new Set(),
  );
  assert.equal(ligne.codePris, true);
});

test("son PROPRE code ne se signale pas comme pris", () => {
  const pris = new Map([["eric", SA_A]]);
  const [ligne] = annoterImport(
    [{ sa: SA_A, email: "eric@exemple.fr", nom: "Eric" }],
    activite({}),
    pris,
    new Set([SA_A]),
  );
  assert.equal(ligne.codePris, false);
});
