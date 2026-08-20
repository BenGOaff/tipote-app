// tests/logic/share-credit.test.mts
//
// LE BONUS SE DÉBLOQUAIT SANS PARTAGE (signalement client, 20 août 2026).
//
// "J'ai remarqué que le bouton Partage sur un réseau pour débloquer ton
// bonus était cliquable et permettait de débloquer le bonus mais sans
// forcément avoir partagé le quiz."
//
// La cause tenait dans un commentaire qui affirmait le contraire de la
// documentation :
//
//   // Web Share API (mainly mobile) — only resolves when the user
//   // actually completes the share sheet, so we can credit without
//   // heuristics.
//
// La doc du navigateur dit : "On Windows this happens WHEN THE SHARE
// POPUP IS LAUNCHED". Le code faisait `.then(() => trackShare())` : sur
// Windows, le bonus partait à l'ouverture de la fenêtre.
//
// Les trois autres chemins avaient tous leur garde-fou de durée. Un seul
// en était exempté, parce qu'un commentaire disait qu'il n'en avait pas
// besoin. C'est le défaut du 1er août, mot pour mot : une logique écrite
// pour un cas (Android) appliquée telle quelle à un autre (Windows).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MIN_COPY_DWELL_MS,
  MIN_SHARE_DWELL_MS,
  nativeShareResolveIsProof,
  readShareCredit,
} from "../../lib/quiz/shareCredit.ts";

const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test("LE BUG : sur Windows, un clic instantane ne debloque PLUS le bonus", () => {
  // Exactement ce que la cliente a vecu : elle clique, la fenetre
  // s'ouvre, la promesse est tenue tout de suite, et l'ancien code
  // creditait. On ne credite plus.
  const verdict = readShareCredit({
    channel: "native",
    elapsedMs: 12,
    resolveIsProof: nativeShareResolveIsProof(WINDOWS),
  });
  assert.notEqual(verdict, "credit", "le bonus se debloque encore sans partage sur Windows");
  assert.equal(verdict, "ask_confirm");
});

test("mais on ne PUNIT pas celui qui a vraiment partage", () => {
  // Refuser sechement ferait perdre son bonus a quelqu'un d'honnete, a
  // cause d'une particularite de SON navigateur. On lui demande de
  // confirmer, comme apres une copie de lien.
  assert.equal(
    readShareCredit({ channel: "native", elapsedMs: 12, resolveIsProof: false }),
    "ask_confirm",
  );
  // Et s'il est reste dans la fenetre, on lui fait credit sans rien
  // demander : c'est la meme preuve qu'un bouton reseau.
  assert.equal(
    readShareCredit({ channel: "native", elapsedMs: MIN_SHARE_DWELL_MS, resolveIsProof: false }),
    "credit",
  );
});

test("le parcours mobile ne gagne PAS un clic de plus", () => {
  // C'est le gros du trafic. Sur Android et iOS la resolution arrive
  // quand les donnees ont ete passees a la cible : c'est la meilleure
  // preuve qu'on puisse avoir, on credite tout de suite comme avant.
  for (const ua of [ANDROID, IPHONE]) {
    assert.equal(nativeShareResolveIsProof(ua), true, ua.slice(0, 40));
    assert.equal(
      readShareCredit({ channel: "native", elapsedMs: 400, resolveIsProof: true }),
      "credit",
    );
  }
});

test("un agent utilisateur illisible est traite comme Windows", () => {
  // Dans le doute on DEMANDE, on ne donne pas. L'absence ferme, comme
  // partout ailleurs dans ce depot.
  for (const ua of [null, undefined, "", "   "]) {
    assert.equal(nativeShareResolveIsProof(ua), false, JSON.stringify(ua));
  }
});

test("les boutons reseau gardent leur garde-fou de duree", () => {
  assert.equal(readShareCredit({ channel: "network", elapsedMs: 200 }), "too_fast");
  assert.equal(readShareCredit({ channel: "network", elapsedMs: MIN_SHARE_DWELL_MS - 1 }), "too_fast");
  assert.equal(readShareCredit({ channel: "network", elapsedMs: MIN_SHARE_DWELL_MS }), "credit");
  // Un reseau ne demande JAMAIS confirmation : on a ouvert un onglet, on
  // sait combien de temps il y est reste.
  assert.notEqual(readShareCredit({ channel: "network", elapsedMs: 10 }), "ask_confirm");
});

test("la copie de lien garde son seuil, plus long", () => {
  // Coller et publier prend plus de temps que d'ecrire dans une fenetre
  // deja ouverte : le seuil n'est pas le meme, et c'est voulu.
  assert.ok(MIN_COPY_DWELL_MS > MIN_SHARE_DWELL_MS);
  assert.equal(readShareCredit({ channel: "copy", elapsedMs: MIN_COPY_DWELL_MS - 1 }), "too_fast");
  assert.equal(readShareCredit({ channel: "copy", elapsedMs: MIN_COPY_DWELL_MS }), "credit");
});

test("une duree absurde ne debloque rien", () => {
  // Une horloge qui recule, un `Date.now()` fantaisiste : on ne credite
  // pas sur une valeur qu'on ne sait pas lire.
  for (const ms of [Number.NaN, Number.NEGATIVE_INFINITY, -99999]) {
    assert.equal(readShareCredit({ channel: "network", elapsedMs: ms }), "too_fast", String(ms));
    assert.equal(
      readShareCredit({ channel: "native", elapsedMs: ms, resolveIsProof: false }),
      "ask_confirm",
      String(ms),
    );
  }
});

test("le viewer appelle la fonction, et n'a plus ses propres seuils", () => {
  // Le vrai garde-fou de regression : deux copies d'un seuil finissent
  // par ne plus valoir la meme chose, et c'est comme ca que le chemin
  // natif s'etait retrouve tout seul dans son coin.
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/quiz/PublicQuizClient.tsx"),
    "utf8",
  );
  assert.ok(src.includes("readShareCredit("), "le viewer ne passe plus par la fonction");
  assert.ok(
    !/const MIN_SHARE_DWELL_MS\s*=/.test(src),
    "le viewer a repris sa propre copie du seuil de partage",
  );
  assert.ok(
    !/const MIN_COPY_DWELL_MS\s*=/.test(src),
    "le viewer a repris sa propre copie du seuil de copie",
  );
  assert.ok(
    !/\.then\(\(\) => trackShare\(\)\)/.test(src),
    "le partage natif credite de nouveau sur la simple resolution de la promesse",
  );
});
