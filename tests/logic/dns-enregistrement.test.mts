// tests/logic/dns-enregistrement.test.mts
//
// "Là il est paumé de chez paumé" (Béné, 29 août 2026).
//
// Eric est chez OVH. L'écran lui demandait un CNAME nommé `@`, qu'OVH
// refuse en rouge et que personne ne peut créer : à la racine d'une
// zone, un CNAME ne peut pas cohabiter avec le SOA et les NS. On lui
// demandait l'impossible, et le contrôle serveur, lui, acceptait déjà
// l'enregistrement A que l'écran ne montrait jamais.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decouperHote, enregistrementPour } from "@/lib/dns/enregistrement";

const CIBLES = { cname: "connect.tipote.com", ip: "82.25.115.166" };

test("le sous-domaine d'Eric : un CNAME, nommé quiz", () => {
  const e = enregistrementPour("quiz.business-affiliation-libre.fr", CIBLES);
  assert.equal(e.forme, "cname");
  assert.equal(e.nom, "quiz");
  assert.equal(e.cible, "connect.tipote.com");
  assert.equal(e.racine, "business-affiliation-libre.fr");
  assert.equal(e.apex, false);
});

test("À LA RACINE, on ne demande JAMAIS un CNAME", () => {
  const e = enregistrementPour("business-affiliation-libre.fr", CIBLES);
  // C'est LE bug qu'Eric a vécu : OVH refuse, et il n'a aucun recours.
  assert.notEqual(e.forme, "cname");
  assert.equal(e.forme, "a");
  assert.equal(e.nom, "@");
  assert.equal(e.cible, "82.25.115.166");
  assert.equal(e.apex, true);
  // Et on lui propose la bonne configuration au lieu de le laisser
  // recopier une adresse IP qui ne suivra pas un changement de serveur.
  assert.equal(e.suggestion, "quiz.business-affiliation-libre.fr");
});

test("les cibles sont des PARAMÈTRES, jamais des constantes lues ici", () => {
  const e = enregistrementPour("quiz.exemple.fr", { cname: "autre.hote.fr", ip: "1.2.3.4" });
  assert.equal(e.cible, "autre.hote.fr");
  // Un écran qui afficherait une valeur pendant que le contrôle en
  // vérifie une autre est exactement le bug du 3 août.
  assert.equal(enregistrementPour("exemple.fr", { cname: "x", ip: "1.2.3.4" }).cible, "1.2.3.4");
});

test("un suffixe à deux niveaux ne coupe pas au mauvais endroit", () => {
  // L'ancien découpage rendait nom = "quiz.mon-site" et racine = "co.uk".
  // Le champ que la personne RECOPIE était donc faux.
  const sous = decouperHote("quiz.mon-site.co.uk");
  assert.equal(sous.nom, "quiz");
  assert.equal(sous.racine, "mon-site.co.uk");
  assert.equal(sous.apex, false);

  // Et la racine était prise pour un sous-domaine.
  const racine = decouperHote("mon-site.co.uk");
  assert.equal(racine.apex, true);
  assert.equal(racine.racine, "mon-site.co.uk");

  for (const hote of ["mon-site.com.br", "mon-site.com.au", "mon-site.co.jp"]) {
    assert.equal(decouperHote(hote).apex, true, hote);
  }
});

test("un sous-domaine à plusieurs niveaux garde tous ses labels", () => {
  assert.equal(decouperHote("le.quiz.exemple.fr").nom, "le.quiz");
});

test("un TLD long n'est pas confondu avec un suffixe à deux niveaux", () => {
  // "co" devant un TLD de plus de deux lettres est un vrai domaine.
  const e = decouperHote("quiz.co.tech");
  assert.equal(e.racine, "co.tech");
  assert.equal(e.nom, "quiz");
});

test("un hôte écrit avec un point final ou en majuscules est compris", () => {
  const e = enregistrementPour("QUIZ.Exemple.FR.", CIBLES);
  assert.equal(e.nom, "quiz");
  assert.equal(e.racine, "exemple.fr");
});
