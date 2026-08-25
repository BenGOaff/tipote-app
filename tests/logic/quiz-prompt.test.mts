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

// ── La page de résultat : ce que Béné a vu le 25 août 2026 ───────────
//
// "Le CTA est éclaté, trop de texte, on n'annonce pas le prix. Le
// résultat n'apporte rien, c'est pas assez concret, pas assez développé.
// Il manque la dernière partie. Bref c'est éclaté au sol, il faut le
// retravailler pour appliquer les conseils de l'atelier pour vendre ou
// remplir l'objectif du quiz avec un quiz créé par IA MAIS AUSSI AVEC UN
// QUIZ IMPORTÉ."
//
// Les deux moitiés du premier reproche disent la même chose : le prix,
// la garantie et le délai avaient atterri DANS le bouton, donc le bouton
// était illisible ET le seul endroit qui pouvait vraiment présenter
// l'offre (le texte du pont) ne la présentait pas.

test("le libellé du bouton ne porte NI prix NI garantie NI délai", () => {
  const { system } = gen();
  assert.match(system, /LIBELLÉ DU BOUTON/);
  assert.match(system, /3 à 6 mots/);
  assert.match(system, /INTERDIT dans le libellé : un prix/);
  // Et le prix n'est pas perdu pour autant : il a une place nommée.
  assert.match(system, /dans le TEXTE DU PONT/);
});

test("la règle du bouton vaut AUSSI à l'import", () => {
  // Elle vivait à l'intérieur du prompt de génération : l'import ne
  // l'avait pas. Une règle recopiée dans un seul des deux chemins n'est
  // pas une règle.
  const { system } = buildQuizImportPrompt({ content: "Q1 ...", locale: "fr" });
  assert.match(system, /LIBELLÉ DU BOUTON/);
  assert.match(system, /3 à 6 mots/);
});

test("l'import produit les 4 temps, headings et pont compris", () => {
  // "il manque la dernière partie" : le gabarit de sortie de l'import
  // n'avait ni bridge, ni aucun heading. Un quiz importé ne pouvait donc
  // PAS naître avec une page de résultat complète.
  const { system, user } = buildQuizImportPrompt({ content: "Q1 ...", locale: "fr" });
  for (const champ of [
    "insight_heading",
    "projection_heading",
    "bridge_heading",
    '"bridge"',
  ]) {
    assert.ok(system.includes(champ), `${champ} absent du prompt d'import`);
  }
  assert.match(system, /LES QUATRE SONT OBLIGATOIRES/);
  assert.match(user, /QUATRE temps remplis/);
});

test("le PONT nomme l'offre en génération, et n'invente rien à l'import", () => {
  // La mécanique est un PARAMÈTRE : les deux chemins ne peuvent pas
  // recevoir la même consigne. Demander à l'import de nommer une offre,
  // c'est lui demander d'inventer un prix, et ce prix finirait sur une
  // vraie page lue par de vrais acheteurs.
  const avecOffre = gen({ intention: "vendre ma formation Structurer son offre à 27 euros" });
  assert.match(avecOffre.system, /NOMME L'OFFRE/);
  assert.match(avecOffre.system, /son PRIX s'il l'a donné/);

  // Sans intention business, on ne remplit pas le trou à sa place.
  const sansOffre = gen();
  assert.ok(!sansOffre.system.includes("NOMME L'OFFRE"));
  assert.match(sansOffre.system, /sans inventer de produit, de prix/);

  const importe = buildQuizImportPrompt({ content: "Q1 ...", locale: "fr" });
  assert.ok(!importe.system.includes("NOMME L'OFFRE"));
  assert.match(importe.system, /Le pont se DÉDUIT du texte source/);

  // Les trois cas interdisent l'invention, aucun n'y échappe.
  for (const { system } of [avecOffre, sansOffre, importe]) {
    assert.match(system, /INVENTE JAMAIS|sans inventer/);
  }
});

test("les longueurs demandées sont celles d'un texte développé", () => {
  // "pas assez développé" : chaque temps était plafonné à "2 à 3
  // phrases", gabarit de sortie compris.
  const { system } = gen();
  assert.match(system, /"description" : 4 à 6 phrases/);
  assert.match(system, /"insight" : 4 à 6 phrases/);
  assert.match(system, /"projection" : 4 à 6 phrases/);
  assert.match(system, /"bridge" : 3 à 5 phrases/);
  // Et le gabarit de sortie ne redit PAS 2-3 phrases juste en dessous.
  const shape = system.slice(system.indexOf("FORMAT DE SORTIE"));
  assert.ok(!/LE MIROIR : 2-3 phrases/.test(shape), "le gabarit contredit la règle");
});

test("le prompt dit ce qui rend un texte CONCRET, il ne le demande pas", () => {
  // "pas assez concret". Demander "sois concret" ne produit rien : il
  // faut un test que le modèle puisse s'appliquer.
  const { system } = gen();
  assert.match(system, /recopiée telle quelle dans le quiz d'une AUTRE niche/);
  assert.match(system, /libère ton potentiel/); // liste noire des phrases creuses
});

test("aucun guillemet à chevrons dans les prompts français", () => {
  // Béné, 25 août 2026 : "le générateur de quiz ne doit jamais utiliser
  // ce type de guillemet en français". Le prompt l'interdisait au modèle
  // dix lignes avant de s'en servir lui-même, exactement comme le tiret
  // cadratin du gabarit de sortie le 3 août.
  const textes = [
    gen().system,
    gen({ addressForm: "vous" }).system,
    buildQuizImportPrompt({ content: "Q1 ...", locale: "fr" }).system,
  ];
  for (const t of textes) {
    // La SEULE occurrence tolérée est la ligne qui énonce la règle : on
    // ne peut pas l'écrire sans montrer le caractère (même exception que
    // "cher·e" dans le test genre-neutre).
    const lignes = t.split("\n").filter((l) => l.includes("«") || l.includes("»"));
    for (const l of lignes) {
      assert.match(l, /jamais « comme cela »/, `chevrons hors de la règle : ${l.trim()}`);
    }
  }
});
