// tests/logic/insight-history.test.mts
//
// Le 4 août 2026, Jocelyne nous a dit avoir suivi les conseils du robot
// pendant trois semaines. Pour savoir ce qu'il lui avait RÉELLEMENT
// conseillé, il a fallu une journée de reconstitution, et la conclusion
// est restée incertaine : `quizzes.ai_insights` est écrasé à chaque
// génération, et `user_insight_reports` a `user_id` en clé primaire.
//
// Ce fichier fige les deux garanties de la correction, et la seconde
// compte autant que la première : on garde une trace, ET écrire cette
// trace ne peut jamais coûter son analyse à la créatrice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const HISTORY = read("../../lib/insights/history.ts");
const QUIZ_ROUTE = read("../../app/api/quiz/[quizId]/insights/route.ts");
const GLOBAL_ROUTE = read("../../app/api/insights/global/route.ts");
const MIGRATION = read("../../supabase/migrations/20260805_ai_report_history.sql");

// ── Les deux routes archivent ────────────────────────────────────────

test("l'analyse d'un quiz laisse une trace", () => {
  assert.match(QUIZ_ROUTE, /recordAiReport\(/);
  assert.match(QUIZ_ROUTE, /scope: "quiz"/);
});

test("l'analyse globale aussi", () => {
  // Elle a le même défaut : une ligne par user, écrasée.
  assert.match(GLOBAL_ROUTE, /recordAiReport\(/);
  assert.match(GLOBAL_ROUTE, /scope: "account"/);
});

// ── Et ça ne peut pas casser l'analyse ───────────────────────────────

test("un échec d'écriture ne remonte jamais à la créatrice", () => {
  // Elle a demandé son analyse, elle est générée, elle est payée.
  // Perdre le rapport pour une trace de diagnostic serait une
  // régression bien pire que le problème qu'on corrige.
  assert.match(HISTORY, /try \{/, "l'insertion est protégée");
  assert.match(HISTORY, /console\.warn/, "et elle laisse une trace pour nous");
  assert.doesNotMatch(HISTORY, /throw /, "elle ne jette jamais");
  assert.match(
    HISTORY,
    /Promise<boolean>/,
    "elle rend un booléen que l'appelant peut ignorer, jamais une exception",
  );
});

test("les appelants n'attendent rien de son retour", () => {
  // Un `if (!ok) return` quelque part et on retomberait sur le cas
  // qu'on essaie d'exclure.
  for (const [label, src] of [
    ["quiz", QUIZ_ROUTE],
    ["global", GLOBAL_ROUTE],
  ] as const) {
    const call = src.slice(src.indexOf("recordAiReport("));
    const after = call.slice(0, 400);
    assert.doesNotMatch(after, /if \(!.*recordAiReport/, label);
  }
});

// ── Ce que la table garantit ─────────────────────────────────────────

test("l'historique n'est pas modifiable depuis le client", () => {
  // Un historique qu'on peut réécrire ne sert à rien.
  assert.match(MIGRATION, /ENABLE ROW LEVEL SECURITY/);
  assert.match(MIGRATION, /FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(MIGRATION, /FOR INSERT/);
  assert.doesNotMatch(MIGRATION, /FOR UPDATE/);
  assert.doesNotMatch(MIGRATION, /FOR DELETE/);
});

test("supprimer un quiz reste possible", () => {
  // Le 3 août, une contrainte RESTRICT rendait un quiz indestructible
  // et l'écran ne disait rien. On ne recrée pas ça pour un historique.
  assert.match(MIGRATION, /quiz_id\s+UUID REFERENCES public\.quizzes\(id\) ON DELETE CASCADE/);
});

test("la migration suit les conventions du repo", () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS/);
  assert.match(MIGRATION, /NOTIFY pgrst, 'reload schema';/);
});

test("les deux lectures qu'on fait vraiment sont indexées", () => {
  // L'historique d'un quiz, et tout ce qu'on a dit à quelqu'un.
  assert.match(MIGRATION, /ai_report_history_quiz_idx/);
  assert.match(MIGRATION, /ai_report_history_user_idx/);
});
