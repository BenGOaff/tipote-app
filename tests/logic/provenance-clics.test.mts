// tests/logic/provenance-clics.test.mts
//
// D'OÙ VIENNENT VRAIMENT SES FILLEULS (Béné, 27 août 2026).
//
// "Je veux le canal : Youtube, email, fb, linkedin... tout ce qui est
// intéressant pour que l'affilié identifie d'où viennent vraiment ses
// affiliés et insister sur ce canal. C'est ça qui est important, on
// réfléchit toujours en terme de ce qui est utile et pas ce qui rend
// bien."
//
// Ce que ce test protège, c'est l'HONNÊTETÉ du comptage. Un tableau de
// provenance est fait pour décider où remettre du travail : un chiffre
// flatteur y coûte des semaines de travail au mauvais endroit.

import { test } from "node:test";
import assert from "node:assert/strict";

import { construireProvenance, type LigneClic } from "@/lib/affiliate/provenanceClics";

const clic = (source: string | null, channel: string | null, ip: string | null): LigneClic => ({
  source,
  channel,
  ip_hash: ip,
});

test("les provenances sortent triées, la plus grosse d'abord", () => {
  // C'est la seule question que l'affilié se pose en ouvrant l'écran :
  // sur quoi insister.
  const v = construireProvenance([
    clic("youtube", null, "a"),
    clic("linkedin", null, "b"),
    clic("youtube", null, "c"),
    clic("youtube", null, "d"),
  ]);
  assert.deepEqual(v.parSource.map((s) => s.cle), ["youtube", "linkedin"]);
  assert.equal(v.parSource[0].clics, 3);
});

test("un même visiteur qui clique trois fois reste UN visiteur", () => {
  const v = construireProvenance([
    clic("youtube", null, "empreinte-1"),
    clic("youtube", null, "empreinte-1"),
    clic("youtube", null, "empreinte-1"),
  ]);
  assert.equal(v.totaux.clics, 3);
  assert.equal(v.totaux.visiteurs, 1);
});

test("un clic sans empreinte compte pour UN visiteur, jamais fondu avec les autres", () => {
  // Les fondre en un seul sous-estimerait franchement, et ce sont
  // justement les clics qu'on connaît le moins bien.
  const v = construireProvenance([
    clic("youtube", null, null),
    clic("youtube", null, null),
    clic("youtube", null, "empreinte-1"),
  ]);
  assert.equal(v.totaux.visiteurs, 3);
  assert.equal(v.sansEmpreinte, 2);
});

test("le canal est compté À CÔTÉ de la provenance, pas à la place", () => {
  // Ne garder que le canal donnerait un écran vide à tous ceux qui ne
  // taguent rien ; ne garder que la provenance empêcherait de
  // distinguer deux vidéos YouTube.
  const v = construireProvenance([
    clic("youtube", "video-12", "a"),
    clic("youtube", "video-30", "b"),
    clic("email", "newsletter", "c"),
  ]);
  assert.equal(v.parSource.length, 2);
  assert.deepEqual(v.parCanal.map((c) => c.cle).sort(), ["newsletter", "video-12", "video-30"]);
});

test("celui qui n'étiquette rien n'a pas d'écran vide", () => {
  const v = construireProvenance([clic("linkedin", null, "a"), clic("email", null, "b")]);
  assert.equal(v.parCanal.length, 0);
  assert.equal(v.parSource.length, 2);
});

test("une provenance absente est nommée `direct`, jamais laissée vide", () => {
  // Une ligne sans étiquette dans un tableau se lit comme une panne.
  const v = construireProvenance([clic(null, null, "a"), clic("", null, "b")]);
  assert.deepEqual(v.parSource.map((s) => s.cle), ["direct"]);
  assert.equal(v.parSource[0].clics, 2);
});

test("aucun clic ne produit aucun chiffre inventé", () => {
  const v = construireProvenance([]);
  assert.deepEqual(v.totaux, { clics: 0, visiteurs: 0 });
  assert.deepEqual(v.parSource, []);
  assert.deepEqual(v.parCanal, []);
});
