// tests/logic/share-networks.test.mts
//
// Béné, 1er août 2026 : "le lien partager mes résultats en fin de quiz ne
// déclenche rien. Il pourrait proposer les réseaux sélectionnés par
// l'user, tous les réseaux s'il ne choisit aucun en particulier."
//
// Le repli était codé en dur à deux endroits du viewer, avec 5 réseaux
// sur 9 : une créatrice qui ne cochait rien (le cas par défaut) privait
// ses visiteurs d'Instagram, Pinterest, Reddit et email sans le savoir.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { resolveShareNetworks } from "../../lib/quiz/shareNetworks.ts";
import { ALLOWED_SHARE_NETWORKS } from "../../lib/quizBranding.ts";

describe("Les réseaux proposés au visiteur", () => {
  test("aucun réseau coché : on les propose TOUS", () => {
    assert.deepEqual(resolveShareNetworks([]), [...ALLOWED_SHARE_NETWORKS]);
  });

  test("colonne jamais renseignée : on les propose tous aussi", () => {
    // Un quiz créé avant la feature a share_networks à null.
    assert.deepEqual(resolveShareNetworks(null), [...ALLOWED_SHARE_NETWORKS]);
    assert.deepEqual(resolveShareNetworks(undefined), [...ALLOWED_SHARE_NETWORKS]);
  });

  test("le repli n'oublie personne", () => {
    // LE BUG : le repli codé en dur s'arrêtait à 5 réseaux.
    const all = resolveShareNetworks(null);
    for (const n of ["instagram", "pinterest", "reddit", "email"]) {
      assert.ok(all.includes(n as never), `${n} doit être proposé`);
    }
    assert.equal(all.length, ALLOWED_SHARE_NETWORKS.length);
  });

  test("une sélection est respectée, dans SON ordre", () => {
    assert.deepEqual(resolveShareNetworks(["pinterest", "facebook"]), ["pinterest", "facebook"]);
  });

  test("un seul réseau coché reste un seul réseau", () => {
    assert.deepEqual(resolveShareNetworks(["facebook"]), ["facebook"]);
  });

  test("un réseau inconnu est écarté, il ne laisse pas un bouton mort", () => {
    assert.deepEqual(resolveShareNetworks(["facebook", "myspace"]), ["facebook"]);
  });

  test("QUE des réseaux inconnus : on retombe sur tous, jamais sur zéro bouton", () => {
    assert.deepEqual(resolveShareNetworks(["myspace"]), [...ALLOWED_SHARE_NETWORKS]);
  });

  test("les doublons ne dupliquent pas les boutons", () => {
    assert.deepEqual(resolveShareNetworks(["x", "x", "facebook"]), ["x", "facebook"]);
  });

  test("une valeur illisible ne casse pas l'écran", () => {
    assert.deepEqual(resolveShareNetworks("facebook"), [...ALLOWED_SHARE_NETWORKS]);
    assert.deepEqual(resolveShareNetworks(42), [...ALLOWED_SHARE_NETWORKS]);
  });
});
