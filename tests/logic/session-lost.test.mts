// tests/logic/session-lost.test.mts
//
// Béné, 4 août 2026 : "putain mais t'as foutu quoi ??"
//
// Sa session était tombée. Elle avait donné ses accès à quelqu'un qui
// gère sa publicité ; cette connexion a fait tourner le jeton Supabase,
// et l'onglet resté ouvert sur son quiz s'est retrouvé avec un jeton
// périmé. Le renouvellement a répondu 400, puis chaque appel a répondu
// 401.
//
// Elle l'a découvert DANS LA CONSOLE. L'écran ne disait rien, le bouton
// Enregistrer ne disait rien, et la sauvegarde automatique a réessayé
// une quinzaine de fois dans le vide. Pendant ce temps son brouillon
// n'existait QUE sur le serveur, c'est à dire nulle part.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  clearDraftBackup,
  isSessionLost,
  loginHrefFor,
  readDraftBackup,
  writeDraftBackup,
} from "../../lib/auth/sessionLost.ts";

/** Un localStorage de test, avec la possibilité de tomber en panne. */
function fakeStorage(opts: { failing?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    map,
    setItem(k: string, v: string) {
      if (opts.failing) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
  };
}

// ── Reconnaître une session morte ────────────────────────────────────

test("un 401 veut dire que la session est tombée", () => {
  assert.equal(isSessionLost(401), true);
});

test("une vraie panne serveur n'est pas une déconnexion", () => {
  // Un 500 ou un 409 appelle un autre message : confondre les deux
  // enverrait quelqu'un se reconnecter pour rien.
  for (const status of [200, 400, 403, 409, 500, 502]) {
    assert.equal(isSessionLost(status), false, `${status} ne doit pas dire "déconnectée"`);
  }
});

// ── Où on la renvoie ─────────────────────────────────────────────────

test("on revient sur l'écran exact, pas sur le tableau de bord", () => {
  // Se faire déconnecter et devoir retrouver son quiz, c'est une
  // punition de plus.
  assert.equal(
    loginHrefFor("/quiz/24dc3026-b36e-4a3a-9dab-38ef1a94cbc8"),
    "/login?next=%2Fquiz%2F24dc3026-b36e-4a3a-9dab-38ef1a94cbc8",
  );
});

test("une destination qui n'est pas chez nous est refusée", () => {
  // Ce paramètre finit dans une redirection : sans ce garde-fou, c'est
  // une porte ouverte pour envoyer quelqu'un ailleurs après connexion.
  for (const evil of ["//evil.com", "https://evil.com", "http://evil.com/x", "", null, undefined]) {
    assert.equal(loginHrefFor(evil), "/login", `${String(evil)} ne doit pas traverser`);
  }
});

// ── Le filet qui compte vraiment ─────────────────────────────────────

test("le brouillon est mis à l'abri dans le navigateur", () => {
  // Jusqu'ici il ne vivait que sur le serveur : au moment précis où le
  // serveur refuse tout, le travail n'existait plus nulle part.
  const store = fakeStorage();
  assert.equal(writeDraftBackup(store, "quiz-1", { title: "Mon quiz" }, 1000), true);
  const back = readDraftBackup(store, "quiz-1");
  assert.deepEqual(back?.state, { title: "Mon quiz" });
  assert.equal(back?.savedAt, 1000);
});

test("chaque projet a sa propre sauvegarde", () => {
  const store = fakeStorage();
  writeDraftBackup(store, "quiz-1", { title: "A" }, 1);
  writeDraftBackup(store, "quiz-2", { title: "B" }, 2);
  assert.deepEqual(readDraftBackup(store, "quiz-1")?.state, { title: "A" });
  assert.deepEqual(readDraftBackup(store, "quiz-2")?.state, { title: "B" });
});

test("un navigateur qui refuse d'écrire ne casse pas l'éditeur", () => {
  // Navigation privée, quota plein : le filet a le droit d'échouer, il
  // n'a jamais le droit de faire tomber l'écran.
  const store = fakeStorage({ failing: true });
  assert.doesNotThrow(() => writeDraftBackup(store, "quiz-1", { a: 1 }, 1));
  assert.equal(writeDraftBackup(store, "quiz-1", { a: 1 }, 1), false);
});

test("une sauvegarde illisible est ignorée, pas plantée", () => {
  const store = fakeStorage();
  store.map.set("tipote:draft-backup:quiz-1", "{ ceci n'est pas du json");
  assert.equal(readDraftBackup(store, "quiz-1"), null);
});

test("rien de sauvegardé rend null", () => {
  assert.equal(readDraftBackup(fakeStorage(), "jamais-vu"), null);
  assert.equal(readDraftBackup(null, "quiz-1"), null);
});

test("on peut effacer la sauvegarde une fois le travail enregistré", () => {
  const store = fakeStorage();
  writeDraftBackup(store, "quiz-1", { a: 1 }, 1);
  clearDraftBackup(store, "quiz-1");
  assert.equal(readDraftBackup(store, "quiz-1"), null);
});

// ── Les garde-fous structurels ───────────────────────────────────────

test("la sauvegarde automatique ARRÊTE de réessayer sur un 401", () => {
  // Le rapport de Béné montre une quinzaine de 401 d'affilée. Une
  // session morte ne guérit pas toute seule : réessayer ne sert qu'à
  // noyer la console.
  const src = readFileSync(new URL("../../hooks/use-autosave.ts", import.meta.url), "utf8");
  assert.ok(/isSessionLost\(res\.status\)/.test(src), "le 401 doit être traité à part");
  assert.ok(/sessionLostRef\.current\s*=\s*true/.test(src));
  assert.ok(
    /if \(sessionLostRef\.current\) \{[\s\S]{0,120}return;/.test(src),
    "plus aucune tentative une fois la session perdue",
  );
  assert.ok(/writeDraftBackup\(/.test(src), "le brouillon part en local");
});

test("les deux éditeurs affichent le bandeau", () => {
  // La règle du 3 août : une réponse `ok: false` produit TOUJOURS
  // quelque chose à l'écran.
  for (const file of ["QuizDetailClient.tsx", "SurveyDetailClient.tsx"]) {
    const src = readFileSync(new URL(`../../components/quiz/${file}`, import.meta.url), "utf8");
    assert.ok(/<SessionLostBanner visible=\{sessionLost\} \/>/.test(src), file);
    assert.ok(/backupId: quizId/.test(src), `${file} doit activer le filet local`);
  }
});

test("le bandeau ne redirige pas tout seul", () => {
  // Rediriger quelqu'un en train d'écrire serait la deuxième fois qu'on
  // lui prend son travail sans prévenir. C'est elle qui clique.
  const src = readFileSync(
    new URL("../../components/editor/SessionLostBanner.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!/router\.(push|replace)|location\.assign|location\.href\s*=/.test(src));
  assert.ok(/loginHrefFor\(/.test(src), "la destination passe par la fonction testée");
});
