// tests/logic/prenom-un-seul-moment.test.mts
//
// Béné, 25 août 2026 : "Demander le prénom : on l'a au début + ensuite ?
// C'est flou, pas précis, pourquoi ? Si activé au début bah ça reste
// activé c'est tout."
//
// Deux réglages portaient le même mot dans deux sections de l'éditeur, et
// écrivaient la MÊME valeur chez le visiteur :
//   - `ask_first_name`     : l'écran de personnalisation, avant la 1re
//     question, qui alimente la variable {name} des textes ;
//   - `capture_first_name` : le champ Prénom du formulaire de capture,
//     après le quiz, à côté de l'email.
// Les deux cochés, le visiteur donnait son prénom au début puis retrouvait
// une case pré-remplie juste avant son email, c'est à dire un champ de plus
// à franchir à l'endroit exact où on le perd.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { IntlMessageFormat } from "intl-messageformat";

import {
  firstNameMoment,
  firstNameRequiredOnCapture,
  showFirstNameOnCapture,
} from "../../lib/quiz/firstNameAsk.ts";

// ── Le moment ────────────────────────────────────────────────────────

test("l'écran de personnalisation gagne sur le formulaire de capture", () => {
  assert.equal(firstNameMoment({ ask_first_name: true, capture_first_name: true }), "intro");
  assert.equal(firstNameMoment({ ask_first_name: true }), "intro");
  assert.equal(firstNameMoment({ capture_first_name: true }), "capture");
  assert.equal(firstNameMoment({}), "jamais");
});

test("un quiz qui n'avait que la capture ne bouge pas", () => {
  // La garantie habituelle : aucune colonne ne change, c'est la lecture
  // qui est unifiée. Un quiz en ligne aujourd'hui doit rendre la même
  // page qu'hier.
  const quiz = { capture_first_name: true, ask_first_name: false };
  assert.equal(showFirstNameOnCapture(quiz, false), true);
  assert.equal(showFirstNameOnCapture(quiz, true), true);
  assert.equal(firstNameRequiredOnCapture(quiz, true), true);
});

test("demandé au début, le prénom n'est pas redemandé à la capture", () => {
  const quiz = { ask_first_name: true, capture_first_name: true };
  assert.equal(showFirstNameOnCapture(quiz, true), false);
});

test("mais un prénom attendu et manquant est redemandé plutôt que perdu", () => {
  // Arrivée par une URL bricolée, brouillon restauré incomplet : mieux
  // vaut un champ de trop qu'un lead sans prénom que la créatrice
  // croyait collecter.
  const quiz = { ask_first_name: true, capture_first_name: false };
  assert.equal(showFirstNameOnCapture(quiz, false), true);
});

test("ce champ de rattrapage ne BLOQUE jamais l'envoi", () => {
  // Le visiteur a répondu à tout le quiz. Lui refuser son résultat pour
  // un champ qu'il n'a jamais vu s'afficher serait le perdre à la
  // dernière seconde.
  const quiz = { ask_first_name: true, capture_first_name: true };
  assert.equal(firstNameRequiredOnCapture(quiz, true), false);
});

test("aucun prénom demandé nulle part : aucun champ", () => {
  assert.equal(showFirstNameOnCapture({}, false), false);
  assert.equal(firstNameRequiredOnCapture({}, true), false);
});

// ── L'aide qui explique une variable doit s'AFFICHER ─────────────────
//
// En allant préciser ces réglages, on a trouvé pourquoi ils étaient
// "flous" : plusieurs phrases qui les expliquent ne s'affichaient pas du
// tout.
//
// "Écris {resultat} dans ton message" contient un placeholder ICU non
// échappé. next-intl le formate avec zéro paramètre, le formateur lève,
// et l'interface affiche le chemin de la clé à la place de la phrase.
// Les phrases qui documentent la syntaxe des variables étaient toutes
// dans ce cas, y compris les gabarits d'automatisation en {{prenom}}.
//
// L'échappement ICU est l'apostrophe : '{resultat}' rend {resultat}.
//
// TOUTE nouvelle aide qui MONTRE une variable à la créatrice s'ajoute
// ici. Le test FORMATE vraiment, il ne relit pas la source : c'est la
// seule façon de savoir ce qu'elle lit à l'écran.
const AIDES_AVEC_VARIABLE: string[][] = [
  ["quizDetail", "shareMessageHint"],
  ["quizVars", "insertNameTitle"],
  ["automations", "form", "dmMessagePlaceholder"],
  ["automations", "form", "dmMessageHint"],
  ["automations", "templates", "dm", "defaultMessage"],
  ["automations", "templates", "email", "defaultMessage"],
];

test("les aides qui montrent une variable se formatent sans paramètre", () => {
  const locales = readdirSync("messages").filter((f) => f.endsWith(".json"));
  assert.ok(locales.length >= 7, "les 7 langues doivent être scannées");
  for (const file of locales) {
    const messages = JSON.parse(readFileSync(`messages/${file}`, "utf8"));
    for (const chemin of AIDES_AVEC_VARIABLE) {
      let brut: unknown = messages;
      for (const k of chemin) brut = (brut as Record<string, unknown>)?.[k];
      assert.equal(typeof brut, "string", `${file} ${chemin.join(".")} absent`);
      try {
        const rendu = String(
          new IntlMessageFormat(brut as string, file.replace(".json", "")).format({}),
        );
        // Un rendu qui a perdu ses accolades voudrait dire qu'on a
        // supprimé la variable au lieu de l'échapper : la créatrice ne
        // saurait plus quoi taper.
        assert.match(rendu, /\{/, `${file} ${chemin.join(".")} ne montre plus la variable`);
      } catch (e) {
        assert.fail(`${file} ${chemin.join(".")} ne s'affiche pas : ${(e as Error).message}`);
      }
    }
  }
});
