// tests/logic/code-affilie.test.mts
//
// LE CODE PUBLIC D'UNE PERSONNE, DEMANDÉ PAR UNE AUTRE APP.
//
// Béné, 26 août 2026, capture de l'onglet Affiliation de l'Atelier à
// l'appui : "t'as pas oublié un truc ?" L'écran fabriquait encore un
// lien vers un tunnel Systeme.io, alors que l'Atelier est vendu par
// notre bon de commande depuis la veille. Il demande maintenant son
// code ici, parce que le registre est UNIQUE et qu'il vit chez nous.
//
// Ce qui se décide ici touche à de l'argent : qui a droit à un lien, et
// surtout ce qu'on ne réécrit JAMAIS.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decisionCodePourEmail } from "../../lib/affiliate/codeAffilie.ts";

test("une adresse inconnue crée un affilié", () => {
  assert.deepEqual(decisionCodePourEmail({ ligne: null }), { action: "creer" });
});

test("une adresse connue reprend SON identifiant", () => {
  const d = decisionCodePourEmail({ ligne: { sa: "sa123", status: "active" } });
  assert.deepEqual(d, { action: "reprendre", sa: "sa123" });
});

test("un affilié exclu n'a pas de lien", () => {
  // Béné, 26 août : "affilié viré = pas payé. Point barre." Lui rendre
  // un lien le laisserait promouvoir pour rien, donc mentir à son
  // audience sans le savoir.
  const d = decisionCodePourEmail({ ligne: { sa: "sa123", status: "banned" } });
  assert.deepEqual(d, { action: "refuser", raison: "exclu" });
});

test("un affilié en PAUSE garde son lien", () => {
  // Il ne gagne plus, mais il n'a pas triché : le traiter comme un
  // exclu lui retirerait ce qu'il a le droit de garder.
  const d = decisionCodePourEmail({ ligne: { sa: "sa123", status: "paused" } });
  assert.deepEqual(d, { action: "reprendre", sa: "sa123" });
});

test("un statut illisible est lu comme actif", () => {
  // Refuser un lien sur une valeur qu'on ne sait pas lire serait la
  // pire des réponses : c'est la règle déjà posée sur les versements.
  for (const statut of [null, undefined, "", "n_importe_quoi", "ACTIVE"]) {
    const d = decisionCodePourEmail({ ligne: { sa: "sa123", status: statut } });
    assert.equal(d.action, "reprendre", `statut : ${JSON.stringify(statut)}`);
  }
});

test("BANNED s'attrape quelle que soit la casse", () => {
  const d = decisionCodePourEmail({ ligne: { sa: "sa123", status: "BANNED" } });
  assert.deepEqual(d, { action: "refuser", raison: "exclu" });
});

test("on ne re-clé JAMAIS une adresse déjà affiliée sous un autre sa", () => {
  // `sa` est la clé primaire : clics, conversions, commissions et
  // versements y sont accrochés. Le changer en silence orphelinerait de
  // l'argent déjà gagné. C'est un cas pour un humain, et on le DIT.
  const d = decisionCodePourEmail({
    ligne: { sa: "sa_ancien", status: "active" },
    saPropose: "sa_nouveau",
  });
  assert.deepEqual(d, { action: "refuser", raison: "email_deja_affiliee" });
});

test("le même sa reproposé ne change rien", () => {
  const d = decisionCodePourEmail({
    ligne: { sa: "sa123", status: "active" },
    saPropose: "sa123",
  });
  assert.deepEqual(d, { action: "reprendre", sa: "sa123" });
});

test("un sa proposé sur une adresse inconnue n'empêche pas la création", () => {
  // C'est le cas d'un élève qui a déjà promu via leurs tunnels : son
  // identifiant est la SEULE façon que ces ventes lui soient rattachées.
  const d = decisionCodePourEmail({ ligne: null, saPropose: "sa123" });
  assert.deepEqual(d, { action: "creer" });
});

test("un sa vide ou blanc est traité comme absent", () => {
  // Le champ est facultatif : refuser quelqu'un pour un champ optionnel
  // mal rempli le bloquerait sans raison.
  for (const vide of [null, undefined, "", "   "]) {
    const d = decisionCodePourEmail({
      ligne: { sa: "sa_ancien", status: "active" },
      saPropose: vide,
    });
    assert.deepEqual(d, { action: "reprendre", sa: "sa_ancien" }, JSON.stringify(vide));
  }
});

test("l'exclusion passe AVANT le conflit d'identifiant", () => {
  // Inutile de renvoyer quelqu'un vers le support pour une fusion de
  // comptes si de toute façon il n'a droit à aucun lien : la raison
  // affichée doit être la vraie.
  const d = decisionCodePourEmail({
    ligne: { sa: "sa_ancien", status: "banned" },
    saPropose: "sa_nouveau",
  });
  assert.deepEqual(d, { action: "refuser", raison: "exclu" });
});
