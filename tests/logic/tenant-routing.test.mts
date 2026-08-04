// tests/logic/tenant-routing.test.mts
//
// Béné, 4 août 2026 : "on ne peut pas blacklister le mot 'quiz' parce que
// beaucoup vont l'utiliser. C'est LOGIQUE !"
//
// Elle a raison, et la liste en interdisait une vingtaine du même genre
// (dashboard, stats, leads, settings, login...). Ces mots n'étaient pas
// là pour protéger la créatrice : ils étaient là parce que le routeur
// Next fait gagner une route statique contre une route dynamique, donc
// `sondomaine.fr/quiz` serait tombé sur NOTRE page.
//
// La correction est la réécriture vers `/s/<slug>` : plus d'arbitrage à
// rendre, donc plus de mots à interdire. Ce fichier fige les deux moitiés
// de la promesse, parce qu'elles s'annulent si l'une saute :
//   1. tous les mots naturels sont rendus à la créatrice ;
//   2. aucune de nos pages ne fuite sur le domaine d'une cliente.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isReservedPublicSlug,
  routeTenantPath,
  TENANT_SLUG_PREFIX,
} from "../../lib/publicSlug.ts";

// ── 1. Ce que la créatrice récupère ──────────────────────────────────

test("les mots que tout le monde veut utiliser sont rendus", () => {
  // La liste exacte de ce qui était interdit hier et ne l'est plus.
  for (const mot of [
    "quiz",
    "quizzes",
    "stats",
    "leads",
    "dashboard",
    "settings",
    "login",
    "signup",
    "auth",
    "legal",
    "admin",
    "embed",
    "contents",
    "pages",
    "support",
    "popquiz",
    "q",
    "p",
  ]) {
    assert.equal(isReservedPublicSlug(mot), false, `"${mot}" doit être libre`);
    assert.deepEqual(
      routeTenantPath(`/${mot}`),
      { kind: "slug", slug: mot },
      `"${mot}" doit mener au contenu de la créatrice`,
    );
  }
});

test("un slug ordinaire est réécrit vers le chemin interne", () => {
  assert.deepEqual(routeTenantPath("/mon-super-quiz"), {
    kind: "slug",
    slug: "mon-super-quiz",
  });
  assert.equal(TENANT_SLUG_PREFIX, "/s");
});

// ── 2. Ce qui ne doit JAMAIS fuiter chez une cliente ─────────────────

test("nos pages ne sont pas servies sur le domaine d'une cliente", () => {
  // Elles sont bloquées parce qu'elles ont un SOUS-chemin, pas parce que
  // leur nom est interdit : c'est toute la différence.
  for (const chemin of [
    "/dashboard/projets",
    "/admin/users",
    "/settings/facturation",
    "/quiz/24dc3026/analytics",
    "/contents/mes-quiz",
    "/api/profile/share-domain",
    "/api/admin/impersonate",
      ]) {
    assert.deepEqual(routeTenantPath(chemin), { kind: "block" }, chemin);
  }
});

test("le chemin interne n'est pas une adresse publique", () => {
  // On n'y arrive que par réécriture. Le taper doit échouer, sinon un
  // même quiz aurait deux adresses et les partages se disperseraient.
  assert.deepEqual(routeTenantPath("/s/mon-quiz"), { kind: "block" });
});

// ── 3. Ce qui doit continuer de passer tel quel ──────────────────────

test("le viewer, les API du quiz et les assets passent", () => {
  for (const chemin of [
    "/",
    "/q/mon-quiz",
    "/p/ma-video",
    "/embed/p/abc",
    "/pq/ma-popup",
    "/api/pages/abc",
    "/api/quiz/abc/track",
    "/api/leads",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/robots.txt",
    // Drame connu : le logo du footer partait dans le catch-all de slugs.
    "/tipote-logo.png",
    "/fond.jpg",
  ]) {
    assert.deepEqual(routeTenantPath(chemin), { kind: "pass" }, chemin);
  }
});

test("un slug mal formé ne traverse pas", () => {
  // Même forme que sanitizeSlug : la porte ne laisse pas passer un chemin
  // sur lequel la page finirait de toute façon en 404.
  for (const chemin of ["/MonQuiz", "/mon_quiz", "/mon quiz", "/-quiz", "/quiz-"]) {
    assert.deepEqual(routeTenantPath(chemin), { kind: "block" }, chemin);
  }
});

test("le préfixe d'API reste réservé", () => {
  // Le seul segment nu encore interdit, et pour une raison technique :
  // la porte ouvre déjà /api/quiz/ et /api/leads.
  assert.equal(isReservedPublicSlug("api"), true);
  assert.deepEqual(routeTenantPath("/api"), { kind: "block" });
});
