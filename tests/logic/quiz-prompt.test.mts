// tests/logic/quiz-prompt.test.mts
//
// Béné, 3 août 2026 : "à chaque fois, l'IA génère un truc comme ça dans
// le sous titre du quiz : '9 questions, un diagnostic, un truc concret à
// faire ce soir.' Franchement on s'en fout du nombre de questions."
//
// Un prompt est du CODE : il produit une sortie, il a des règles, et il
// régresse silencieusement quand quelqu'un le retouche. Celui-ci n'était
// couvert par rien, et c'est pour ça que trois incohérences y vivaient
// sans que personne les voie (un tiret cadratin dans un prompt qui les
// bannit, un exemple qui contredit sa propre règle, une fourchette de
// questions qui contredit le compte demandé).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildQuizGenerationPrompt,
  buildQuizImportPrompt,
} from "../../lib/prompts/quiz/system.ts";
import { estimateQuizMinutes } from "../../lib/prompts/quiz/copywriting.ts";

function gen(over: Record<string, unknown> = {}) {
  return buildQuizGenerationPrompt({
    objective: "diagnostiquer",
    target: "coachs qui vendent en ligne",
    questionCount: 9,
    resultCount: 4,
    locale: "fr",
    addressForm: "tu",
    ...over,
  } as never);
}

// ── Le bug de Béné ──────────────────────────────────────────────────

test("le prompt INTERDIT explicitement le nombre de questions dans le sous-titre", () => {
  const { system } = gen();
  assert.match(system, /NOMBRE DE QUESTIONS/);
  assert.match(system, /INTERDIT[^\n]*NOMBRE DE QUESTIONS/);
});

test("le prompt dit ce que le sous-titre DOIT contenir, pas seulement qu'il doit être court", () => {
  // La cause du bug : "engageant" et "accrocher" ne sont pas des
  // consignes de fond. Sans substance demandée, le modèle recopie le
  // fait le plus saillant du brief.
  const { system } = gen();
  assert.match(system, /SOUS-TITRE DE L'ACCUEIL/);
  assert.match(system, /LE BÉNÉFICE pour le visiteur/);
});

test("la durée EST demandée : c'est le nombre de questions qui ne l'est pas", () => {
  // Les deux se ressemblent, et les confondre referait le bug dans
  // l'autre sens. Béné veut "en 2mn, 5mn".
  const { system } = gen({ questionCount: 9 });
  assert.match(system, /Annonce la durée/);
  assert.match(system, /environ 3 minutes/);
});

test("la durée suit le nombre de questions", () => {
  assert.equal(estimateQuizMinutes(3), 1);
  assert.equal(estimateQuizMinutes(5), 2);
  assert.equal(estimateQuizMinutes(9), 3);
  // Un quiz absurde n'annonce pas "40 minutes" au visiteur.
  assert.equal(estimateQuizMinutes(500), 15);
  assert.equal(estimateQuizMinutes(0), 1);
});

test("les tournures demandées sont celles de Béné, accordées à la forme d'adresse", () => {
  assert.match(gen({ addressForm: "tu" }).system, /Découvre pourquoi/);
  assert.match(gen({ addressForm: "vous" }).system, /Découvrez pourquoi/);
});

test("le bonus du créateur est repris quand il existe", () => {
  const withBonus = gen({ bonus: "un mini-guide de 12 pages" });
  assert.match(withBonus.system, /un mini-guide de 12 pages/);
  // ...et on n'en promet aucun quand il n'y en a pas.
  assert.match(gen().system, /ne promets RIEN qui n'existe pas/);
});

test("l'import reçoit la MÊME règle : le sous-titre y manque presque toujours", () => {
  // "Il a bien réutilisé mon titre, mais pas le sous titre."
  const { system } = buildQuizImportPrompt({ content: "Q1 ...", locale: "fr" });
  assert.match(system, /SOUS-TITRE DE L'ACCUEIL/);
  assert.match(system, /INTERDIT[^\n]*NOMBRE DE QUESTIONS/);
});

// ── Les trois incohérences trouvées en relisant le prompt ────────────

test("le prompt ne contient aucun tiret cadratin dans ce qu'il montre en exemple", () => {
  // Il bannit les tirets cadratins, et son propre gabarit de sortie en
  // contenait un : "Nom du profil — LE MIROIR". On montrait au modèle
  // exactement ce qu'on lui interdit.
  const { system } = gen();
  const shape = system.slice(system.indexOf("FORMAT DE SORTIE"));
  assert.ok(!shape.includes("—"), "tiret cadratin dans le gabarit de sortie");
  assert.ok(!shape.includes("–"), "tiret demi-cadratin dans le gabarit de sortie");
});

test("l'exemple d'options respecte la règle 'un result_index par option'", () => {
  // L'exemple montrait result_index 0 deux fois alors que la règle juste
  // au-dessus dit "chacun UNE fois". C'est le cas exact qui a fait
  // remonter Véronique (un profil jamais attribuable).
  const { system } = gen();
  const shape = system.slice(system.indexOf("FORMAT DE SORTIE"));
  const indices = [...shape.matchAll(/"result_index":\s*(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(indices, ["0", "1", "2", "3"]);
});

test("le prompt n'annonce pas une fourchette de questions qui contredit le compte demandé", () => {
  // Il disait "Quiz COURT (3 à 5 questions)" ET "NOMBRE DE QUESTIONS : 9".
  const { system, user } = gen({ questionCount: 9, format: "short" });
  assert.ok(!system.includes("3 à 5 questions"), "fourchette contradictoire dans le system");
  assert.ok(!user.includes("(3-5 questions)"), "fourchette contradictoire dans le user");
  assert.match(user, /NOMBRE DE QUESTIONS : 9/);
});
