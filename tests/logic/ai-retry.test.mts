// tests/logic/ai-retry.test.mts
//
// 5 août 2026, journal du serveur de l'Atelier :
//
//   [bonus] Anthropic 529 {"type":"overloaded_error","message":"Overloaded"}
//
// L'API était saturée à cette seconde là. Ça dure quelques secondes, et
// aucun des dix-huit appels de ce repo ne retentait : une créatrice qui
// clique sur "Générer mon quiz" au mauvais moment reçoit un échec
// définitif pour une panne de trois secondes.
//
// Ce fichier fige les deux moitiés : la règle, et le fait que TOUS les
// appels y passent. La deuxième compte autant que la première, parce que
// c'est celle qu'un futur appel oubliera.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_ATTEMPTS, isRetryableStatus, retryDelayMs } from "@/lib/aiRetry";

// ── La règle ─────────────────────────────────────────────────────────

test("529 est une surcharge, donc ça se retente", () => {
  // Le statut vu en vrai le 5 août.
  assert.equal(isRetryableStatus(529), true);
});

test("429 et les 5xx aussi", () => {
  for (const s of [429, 500, 502, 503, 504]) {
    assert.equal(isRetryableStatus(s), true, String(s));
  }
});

test("un 4xx ordinaire ne se retente pas", () => {
  // Rejouer à l'identique une requête refusée redonne le même refus, et
  // fait attendre la créatrice pour rien.
  for (const s of [400, 401, 403, 404, 413, 422]) {
    assert.equal(isRetryableStatus(s), false, String(s));
  }
});

test("l'attente grandit, au lieu de retomber sur la même seconde", () => {
  // Une reprise immédiate retombe sur la MÊME seconde de surcharge :
  // elle ne rattrape rien, elle double juste l'appel.
  assert.ok(retryDelayMs(1) >= 1000);
  assert.ok(retryDelayMs(2) > retryDelayMs(1));
});

test("le fournisseur a le dernier mot sur le délai", () => {
  // Lui seul sait quand sa fenêtre se rouvre.
  assert.equal(retryDelayMs(1, "7"), 7000);
  // Et un en-tête absurde ne fait pas attendre une heure.
  assert.ok(retryDelayMs(1, "99999") <= 20_000);
  assert.ok(retryDelayMs(1, "pas un nombre") >= 1000);
});

test("l'attente totale reste supportable pour quelqu'un qui attend son quiz", () => {
  let total = 0;
  for (let a = 1; a < MAX_ATTEMPTS; a++) total += retryDelayMs(a);
  assert.ok(total <= 6000, `${total} ms ajoutés au pire`);
});

// ── Et tous les appels y passent ─────────────────────────────────────

test("aucun appel a Anthropic ne part sans reprise", () => {
  const callers = [
    "app/api/quiz/generate/route.ts",
    "app/api/quiz/import/route.ts",
    "app/api/templates/reformulate/route.ts",
    "app/api/templates/iterate/route.ts",
    "app/api/pages/generate/route.ts",
    "app/api/coach/chat/route.ts",
    "app/api/coach/chat/greet/route.ts",
    "app/api/coach/encouragement/route.ts",
    "app/api/content/generate/route.ts",
    "lib/autoCommentEngine.ts",
    "lib/claude.ts",
    "lib/coach/proactiveBriefer.ts",
    "app/api/quiz/idea-chat/route.ts",
    "app/api/quiz/gender-variants/route.ts",
    "app/api/quiz/[quizId]/rewrite/route.ts",
    "app/api/quiz/[quizId]/rebalance/route.ts",
    "lib/quiz/insights.ts",
    "lib/insights/global.ts",
  ];
  for (const f of callers) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(src, /api\.anthropic\.com/, f);
    assert.match(src, /fetchAnthropic\(/, `${f} : appelle Anthropic sans passer par la reprise`);
    // Les trois formes d'appel qui existent ici : la constante du
    // module, la constante du coach, et l'URL ecrite en toutes lettres.
    assert.doesNotMatch(
      src,
      /await fetch\((?:CLAUDE_API_URL|ANTHROPIC_URL|"https:\/\/api\.anthropic)/,
      `${f} : un fetch nu reste, il ne retentera pas`,
    );
  }
});

test("une coupure volontaire ne se retente pas", () => {
  // Celui qui a posé l'AbortSignal savait pourquoi : réessayer le ferait
  // couper encore, plus tard, avec le même résultat.
  const src = readFileSync(new URL("../../lib/aiRetry.ts", import.meta.url), "utf8");
  assert.match(src, /AbortError/);
  assert.match(src, /TimeoutError/);
});
