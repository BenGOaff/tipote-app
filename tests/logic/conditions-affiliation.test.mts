// tests/logic/conditions-affiliation.test.mts
//
// UN SEUL TEXTE JURIDIQUE POUR UN SEUL PROGRAMME (Béné, 27 août 2026).
//
// L'espace affilié pointait vers DEUX pages de conditions différentes :
// la page maintenue depuis le tableau de bord, et une page Systeme.io
// figée depuis Promouvoir et Support. Celle-ci annonçait un cookie sans
// durée, un versement fait par Systeme.io et aucun seuil.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conditionsAffiliationUrl } from "@/lib/affiliate/conditionsUrl";

test("la langue de l'affilié suit, quand le texte existe dans cette langue", () => {
  assert.equal(conditionsAffiliationUrl("fr"), "https://quiz.tipote.com/affiliate?lang=fr");
  assert.equal(conditionsAffiliationUrl("it"), "https://quiz.tipote.com/affiliate?lang=it");
  assert.equal(conditionsAffiliationUrl("ar"), "https://quiz.tipote.com/affiliate?lang=ar");
});

test("le portugais n'a pas de traduction des conditions : on ne la réclame pas", () => {
  // La demander servirait l'anglais en silence. Sans le paramètre, la
  // page décide elle-même, et rien ne prétend que le texte est traduit.
  assert.equal(conditionsAffiliationUrl("pt"), "https://quiz.tipote.com/affiliate");
  assert.equal(conditionsAffiliationUrl(null), "https://quiz.tipote.com/affiliate");
  assert.equal(conditionsAffiliationUrl("zz"), "https://quiz.tipote.com/affiliate");
});

test("aucun écran ne renvoie plus vers la copie Systeme.io des conditions", () => {
  for (const f of [
    "app/affiliate/page.tsx",
    "app/affiliate/promouvoir/page.tsx",
    "app/affiliate/support/page.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !src.includes("conditions-generales-affiliation"),
      `${f} renvoie encore vers la page Systeme.io des conditions`,
    );
    assert.ok(
      src.includes("conditionsAffiliationUrl("),
      `${f} n'appelle plus la source unique : un lien y a été réécrit à la main`,
    );
  }
});
