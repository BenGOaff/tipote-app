// tests/logic/alias-gmail-rattachement.test.mts
//
// LE RATTACHEMENT RETROUVE SA PERSONNE, ALIAS COMPRIS (Béné, 12 septembre 2026 :
// "oui on normalise pour gmail stp").
//
// Ce qu'on tient :
//   1. le motif ne reconnaît QUE les formes de la même boîte, et il est
//      sûr face aux caractères spéciaux d'une adresse ;
//   2. c'est le JavaScript qui DÉCIDE, avec la même règle que
//      l'anti-auto-affiliation : la base filtre, elle ne tranche pas ;
//   3. il n'y a qu'UNE lecture, et les deux lecteurs l'appellent ;
//   4. quand la base refuse le motif, on retombe sur l'exact et on le crie.
//
// Vérifié en rejouant quatre versions fautives (le motif sans points
// optionnels, le choix qui rend la première ligne sans juger, le repli
// exact retiré, `rattacher` qui garde sa propre requête) : les quatre
// rougissent.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { motifAliasAdresse, premiereLigneDeLaPersonne } from "@/lib/affiliate/aliasAdresse";
import { normaliserAdresse } from "@/lib/affiliate/memeAdresse";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

/** Le motif tel que Postgres le lira (`~*`, insensible à la casse). */
function reconnait(motif: string | null, adresse: string): boolean {
  assert.ok(motif, "le motif doit exister pour cette adresse");
  return new RegExp(motif, "i").test(adresse);
}

describe("le motif d'alias", () => {
  test("chez Gmail : les points, le +, la casse et googlemail sont la même boîte", () => {
    const m = motifAliasAdresse("bene@gmail.com");
    for (const a of [
      "bene@gmail.com",
      "b.e.n.e@gmail.com",
      "bene+tiquiz@gmail.com",
      "b.ene+x.y@gmail.com",
      "BENE@GMAIL.COM",
      "bene@googlemail.com",
      "b.e.n.e+z@googlemail.com",
    ]) {
      assert.ok(reconnait(m, a), `${a} devrait être reconnue`);
      // Et la règle JavaScript est d'accord : c'est elle qui tranche.
      assert.equal(normaliserAdresse(a), normaliserAdresse("bene@gmail.com"));
    }
  });

  test("chez Gmail : une lettre de plus ou de moins n'est PAS la même personne", () => {
    const m = motifAliasAdresse("bene@gmail.com");
    for (const a of [
      "benex@gmail.com",
      "abene@gmail.com",
      "ben@gmail.com",
      "bene@gmail.co",
      "bene@gmail.com.evil.io",
      "bene@hotmail.com",
      "bene@example.com",
    ]) {
      assert.ok(!reconnait(m, a), `${a} ne devrait PAS être reconnue`);
    }
  });

  test("le motif part de la forme NORMALISÉE : un + ou des points dans la cible ne changent rien", () => {
    assert.equal(motifAliasAdresse("b.e.n.e+quiz@gmail.com"), motifAliasAdresse("bene@gmail.com"));
    assert.equal(motifAliasAdresse("bene@googlemail.com"), motifAliasAdresse("bene@gmail.com"));
  });

  test("ailleurs : le + est accepté, les points sont LITTÉRAUX", () => {
    const m = motifAliasAdresse("jean.dupont@example.com");
    assert.ok(reconnait(m, "jean.dupont@example.com"));
    assert.ok(reconnait(m, "jean.dupont+news@example.com"));
    assert.ok(reconnait(m, "Jean.Dupont@Example.com"));
    // Confondre ces deux là refuserait une commission légitime.
    assert.ok(!reconnait(m, "jeandupont@example.com"));
    assert.ok(!reconnait(m, "jean-dupont@example.com"));
    assert.ok(!reconnait(m, "jean.dupont@example.org"));
  });

  test("les caractères spéciaux d'une adresse sont rendus littéraux, jamais interprétés", () => {
    // Un `.` de domaine non échappé matcherait `exampleXcom` ; un `-`,
    // un `+` ou un `*` dans le nom feraient une expression fausse ou qui
    // ne compile pas.
    const m = motifAliasAdresse("a-b_c*d@ex-ample.co.uk");
    assert.ok(reconnait(m, "a-b_c*d@ex-ample.co.uk"));
    assert.ok(reconnait(m, "a-b_c*d+x@ex-ample.co.uk"));
    assert.ok(!reconnait(m, "a-b_c*d@ex-ampleXco.uk"));
    assert.ok(!reconnait(m, "a-b_ccd@ex-ample.co.uk"));
    // Tout caractère qui a un sens en expression régulière est échappé.
    for (const c of [".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "^", "$", "\\"]) {
      const mm = motifAliasAdresse(`x${c}y@example.com`);
      assert.ok(mm, `motif absent pour ${c}`);
      assert.doesNotThrow(() => new RegExp(mm, "i"), `le motif ne compile pas pour ${c}`);
      assert.ok(reconnait(mm, `x${c}y@example.com`), `x${c}y non reconnu`);
      assert.ok(!reconnait(mm, "xay@example.com"), `x${c}y confondu avec xay`);
    }
  });

  test("une adresse illisible ne donne AUCUN motif, jamais un motif qui matche tout le monde", () => {
    for (const v of ["", "   ", "pasdarobase", "@example.com", "bene@", null, undefined]) {
      assert.equal(motifAliasAdresse(v), null, `${String(v)} devrait rendre null`);
    }
  });
});

describe("le choix de la ligne", () => {
  const lignes = [
    { id: "1", sa: "sa_autre", email: "benex@gmail.com" }, // rendue de trop par la base, hypothétiquement
    { id: "2", sa: "sa_premier", email: "b.e.n.e+quiz@gmail.com" },
    { id: "3", sa: "sa_second", email: "bene@gmail.com" },
  ];

  test("LE PREMIER RATTACHEMENT GAGNE, alias compris : la première ligne qui désigne la personne", () => {
    assert.equal(premiereLigneDeLaPersonne(lignes, "bene@gmail.com")?.sa, "sa_premier");
    assert.equal(premiereLigneDeLaPersonne(lignes, "BENE+autre@googlemail.com")?.sa, "sa_premier");
  });

  test("une ligne rendue de trop par la base est ÉCARTÉE : c'est le JavaScript qui juge", () => {
    assert.equal(premiereLigneDeLaPersonne(lignes, "benex@gmail.com")?.sa, "sa_autre");
    assert.equal(premiereLigneDeLaPersonne([lignes[0]], "bene@gmail.com"), null);
  });

  test("une cible vide ne désigne personne, même si une ligne a une adresse vide", () => {
    assert.equal(premiereLigneDeLaPersonne([{ id: "9", sa: "x", email: "" }], ""), null);
    assert.equal(premiereLigneDeLaPersonne([{ id: "9", sa: "x", email: null }], "bene@gmail.com"), null);
  });
});

describe("une seule lecture, et les deux lecteurs l'appellent", () => {
  test("le module de décision reste pur", () => {
    assert.ok(!/^import .*supabaseAdmin/m.test(lire("lib/affiliate/aliasAdresse.ts")));
  });

  test("la lecture filtre par le motif, laisse le module pur trancher, et retombe sur l'exact en criant", () => {
    const src = sansCommentaires(lire("lib/affiliate/conversionStore.ts"));
    assert.match(src, /\.filter\("email", "imatch", motif\)/, "la base filtre par le motif d'alias");
    assert.match(src, /premiereLigneDeLaPersonne\(/, "le JavaScript décide, pas la base");
    // Le repli exact vit APRÈS la lecture par alias, et il est annoncé.
    const alias = src.indexOf('"imatch"');
    const cri = src.indexOf("console.error");
    const exact = src.indexOf('.eq("email", exact)');
    assert.ok(alias > 0 && cri > alias && exact > cri, "le repli exact suit la lecture par alias, et il se crie");
  });

  test("attributeSale ET rattacher lisent la même fonction, et aucun ne garde sa propre requête", () => {
    const attribution = sansCommentaires(lire("lib/affiliate/attribution.ts"));
    const rattacher = sansCommentaires(lire("app/api/affiliate/rattacher/route.ts"));
    assert.match(attribution, /premiereConversionDeLaPersonne\(email\)/);
    assert.match(rattacher, /premiereConversionDeLaPersonne\(email\)/);
    for (const [nom, src] of [["attribution", attribution], ["rattacher", rattacher]] as const) {
      assert.ok(
        !/from\("affiliate_conversions"\)[\s\S]{0,200}\.eq\("email"/.test(src),
        `${nom} lit encore les conversions par adresse exacte, à côté de la lecture partagée`,
      );
    }
  });
});
