// tests/logic/auth-links.test.mts
//
// Véronique (Tiquiz), 2 août 2026 : "je demande un nouveau mot de passe, je clique
// sur le bouton, et j'arrive sur : localhost n'autorise pas la connexion.
// Bref, je tourne en rond. PS : je n'ai pas de proxy et pas de pare-feu."
//
// Elle avait raison : le lien lui demandait vraiment d'ouvrir un serveur
// sur SA machine. Ce test interdit qu'un lien d'email reparte un jour
// vers une adresse locale, quelle que soit la configuration.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  resolveAppUrl,
  buildAuthCallbackUrl,
  CANONICAL_APP_URL,
} from "../../lib/authLinks.ts";

describe("Véronique : jamais de localhost dans un email", () => {
  test("LE BUG : une variable d'env sur localhost est ignorée", () => {
    assert.equal(
      resolveAppUrl("http://localhost:3000", "https://app.tipote.com"),
      "https://app.tipote.com",
    );
  });

  test("les autres adresses locales aussi", () => {
    for (const local of ["http://127.0.0.1:3000", "http://[::1]:3000", "http://mac.local"]) {
      assert.equal(resolveAppUrl(local, null), CANONICAL_APP_URL, local);
    }
  });

  test("variable absente : on prend le domaine par lequel la demande arrive", () => {
    assert.equal(resolveAppUrl(null, "https://app.tipote.com"), "https://app.tipote.com");
    assert.equal(resolveAppUrl("", "https://app.tipote.com"), "https://app.tipote.com");
    assert.equal(resolveAppUrl("   ", "https://app.tipote.com"), "https://app.tipote.com");
  });

  test("rien d'exploitable : le domaine canonique, jamais une impasse", () => {
    assert.equal(resolveAppUrl(null, null), CANONICAL_APP_URL);
    assert.equal(resolveAppUrl("pas une url", "non plus"), CANONICAL_APP_URL);
    assert.equal(resolveAppUrl("javascript:alert(1)", null), CANONICAL_APP_URL);
  });

  test("une configuration correcte est respectée", () => {
    assert.equal(resolveAppUrl("https://app.tipote.com", null), "https://app.tipote.com");
    // La barre finale ne doit pas produire un double slash dans le lien.
    assert.equal(resolveAppUrl("https://app.tipote.com/", null), "https://app.tipote.com");
  });
});

describe("Le lien de l'email pointe sur NOTRE page", () => {
  test("il porte le jeton et le type, sur notre domaine", () => {
    const url = buildAuthCallbackUrl("https://app.tipote.com", {
      tokenHash: "abc123",
      type: "recovery",
    });
    assert.ok(url.startsWith("https://app.tipote.com/auth/callback?"), url);
    const q = new URL(url).searchParams;
    assert.equal(q.get("token_hash"), "abc123");
    assert.equal(q.get("type"), "recovery");
  });

  test("aucun rebond par Supabase : c'est ce rebond qui menait sur localhost", () => {
    const url = buildAuthCallbackUrl("https://app.tipote.com", {
      tokenHash: "abc",
      type: "recovery",
    });
    assert.ok(!url.includes("supabase"), "le lien ne doit pas passer par Supabase");
    assert.ok(!url.includes("redirect_to"), "plus de redirection a autoriser");
  });

  test("un jeton exotique reste lisible une fois encodé", () => {
    const url = buildAuthCallbackUrl("https://app.tipote.com", {
      tokenHash: "a+b/c=d&e",
      type: "recovery",
    });
    assert.equal(new URL(url).searchParams.get("token_hash"), "a+b/c=d&e");
  });

  test("une barre finale ne double pas le slash", () => {
    assert.ok(
      buildAuthCallbackUrl("https://app.tipote.com/", { tokenHash: "x", type: "magiclink" })
        .startsWith("https://app.tipote.com/auth/callback?"),
    );
  });
});
