// tests/logic/profile-winner.test.mts
//
// Béné, 3 août 2026 : "le scoring du quiz par profil me parait assez
// aléatoire. Peut-être parce que j'ai importé mon quiz ? (...) faudrait
// vraiment pouvoir supprimer cette histoire d'ex aequo, c'est chiant à
// mourir."
//
// Ce n'était pas l'import. En cas d'égalité, le viewer donnait TOUJOURS
// le premier profil de la liste : un visiteur pouvait répondre tout
// autrement et retomber sur le même profil. C'est exactement ce que
// "aléatoire" décrit, vu de l'extérieur.
//
// Ce fichier fige les deux garanties :
//   - "first" ne bouge pas d'un pouce (les quiz existants) ;
//   - "answers" fait dépendre le départage des réponses, et la chaîne
//     est celle qu'on a promise, dans cet ordre.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pickProfileWinner,
  tallyVotes,
  tieBreakMode,
  type ProfileVote,
} from "../../lib/quiz/profileWinner.ts";

/** Raccourci : une voix par (profil, poids, question). */
const v = (resultIndex: number, weight = 1, questionIndex = 0): ProfileVote => ({
  resultIndex,
  weight,
  questionIndex,
});

const win = (votes: ProfileVote[], count: number, mode: "first" | "answers") =>
  pickProfileWinner(tallyVotes(votes, count), mode);

// ── La garantie qui protège les quiz déjà en ligne ───────────────────

test("le défaut est le comportement historique", () => {
  // La colonne absente, une valeur inconnue, la migration pas encore
  // passee : dans les trois cas, rien ne change pour la creatrice.
  assert.equal(tieBreakMode(null), "first");
  assert.equal(tieBreakMode(undefined), "first");
  assert.equal(tieBreakMode(""), "first");
  assert.equal(tieBreakMode("nawak"), "first");
  assert.equal(tieBreakMode("answers"), "answers");
});

test("en mode historique, l'égalité donne toujours le premier profil", () => {
  // On FIGE l'ancien comportement : un quiz existant qui ne bascule pas
  // doit attribuer exactement les memes profils qu'hier.
  const votes = [v(0, 1, 0), v(1, 1, 1)];
  assert.equal(win(votes, 2, "first").index, 0);
  // Meme en inversant l'ordre des reponses.
  assert.equal(win([v(1, 1, 0), v(0, 1, 1)], 2, "first").index, 0);
});

// ── Ce que change le nouveau mode ────────────────────────────────────

test("le score le plus haut gagne, dans les deux modes", () => {
  const votes = [v(0, 1, 0), v(1, 1, 1), v(1, 1, 2)];
  assert.equal(win(votes, 2, "first").index, 1);
  assert.equal(win(votes, 2, "answers").index, 1);
});

test("à points égaux, le profil choisi le plus SOUVENT l'emporte", () => {
  // 0 : trois reponses a 1 point. 1 : une seule reponse a 3 points.
  // Meme total, mais 0 a ete choisi trois fois : c'est la constance.
  const votes = [v(0, 1, 0), v(0, 1, 1), v(0, 1, 2), v(1, 3, 3)];
  assert.equal(win(votes, 2, "answers").index, 0);
});

test("à voix égales, le profil choisi le plus FRANCHEMENT l'emporte", () => {
  // Deux voix chacun, meme total : celui qui a recu la reponse la plus
  // lourde passe devant (retour Adeline, deja en place).
  const votes = [v(0, 1, 0), v(0, 3, 1), v(1, 2, 2), v(1, 2, 3)];
  assert.equal(win(votes, 2, "answers").index, 0);
});

test("sur un quiz NON pondéré, c'est la réponse la plus récente qui tranche", () => {
  // Le cas le plus courant, et celui de Bene : tous les points valent 1,
  // donc score, nombre de voix et voix la plus forte sont identiques.
  // Sans ce cran, on retomberait sur "toujours le premier profil".
  assert.equal(win([v(0, 1, 0), v(1, 1, 1)], 2, "answers").index, 1);
  assert.equal(win([v(1, 1, 0), v(0, 1, 1)], 2, "answers").index, 0);
});

test("répondre autrement donne un profil différent", () => {
  // La phrase exacte du probleme : "ca me parait aleatoire". Deux
  // visiteurs, deux copies differentes, deux profils differents.
  const visiteurA = [v(0, 1, 0), v(1, 1, 1), v(0, 1, 2), v(1, 1, 3)];
  const visiteurB = [v(1, 1, 0), v(0, 1, 1), v(1, 1, 2), v(0, 1, 3)];
  assert.notEqual(win(visiteurA, 2, "answers").index, win(visiteurB, 2, "answers").index);
  // Alors qu'en mode historique, les deux obtenaient le meme profil.
  assert.equal(win(visiteurA, 2, "first").index, win(visiteurB, 2, "first").index);
});

// ── Ce qu'on signale encore à la créatrice, et ce qu'on ne signale plus ──

test("une égalité que la chaîne sait trancher n'est PLUS un conflit", () => {
  // C'est ce qui fait taire le bandeau "chiant a mourir" : le viewer sait
  // quoi faire, donc il n'y a rien a corriger.
  assert.deepEqual(win([v(0, 1, 0), v(1, 1, 1)], 2, "answers").tiedAfter, []);
});

test("deux profils VRAIMENT indiscernables restent signalés", () => {
  // Meme question, meme poids, meme rang : la creatrice doit trancher
  // elle-meme. C'est le seul cas qui merite encore une alerte.
  const votes = [v(0, 1, 0), v(1, 1, 0)];
  assert.deepEqual(win(votes, 2, "answers").tiedAfter, [0, 1]);
});

test("en mode historique, l'égalité de score reste signalée", () => {
  // Tant qu'elle n'a pas bascule, l'alerte reste vraie pour elle : son
  // resultat NE depend pas des reponses.
  assert.deepEqual(win([v(0, 1, 0), v(1, 1, 1)], 2, "first").tiedAfter, [0, 1]);
});

test("personne n'a rien choisi : ce n'est pas un ex-æquo", () => {
  // Zero voix partout (que des questions sautees) : signaler serait un
  // reproche sur un quiz sain.
  assert.deepEqual(win([], 3, "answers").tiedAfter, []);
  assert.equal(win([], 3, "answers").index, 0);
});

test("un quiz sans profil ne casse rien", () => {
  assert.equal(win([v(0)], 0, "answers").index, -1);
});

test("une réponse qui vise un profil supprimé est ignorée", () => {
  // `result_index` hors bornes : la question pointe un profil qui
  // n'existe plus. On l'ecarte au lieu d'ecrire hors du tableau.
  const t = tallyVotes([v(5, 1, 0), v(-1, 1, 1), v(0, 1, 2)], 2);
  assert.deepEqual(t.scores, [1, 0]);
});

test("le multi-select vote pour plusieurs profils sur la même question", () => {
  // Deux voix issues de la MEME question : elles gardent le meme rang,
  // donc la recence ne les departage pas artificiellement.
  const t = tallyVotes([v(0, 1, 2), v(1, 1, 2)], 2);
  assert.deepEqual(t.lastVote, [2, 2]);
});

// ── L'effet mesuré sur les deux formats de quiz les plus courants ────
//
// C'est LA promesse faite à Béné ("supprimer cette histoire d'ex-æquo").
// Elle se mesure, elle ne se raconte pas.

test("le bandeau d'ex-æquo disparaît sur un quiz de profils normal", async () => {
  const { analyzeTies } = await import("../../lib/quizTieAnalysis.ts");

  // 6 questions, 3 profils, une réponse par profil, aucune pondération :
  // le quiz de profils le plus courant, et celui que l'IA génère.
  const q6 = Array.from({ length: 6 }, () => ({
    options: [{ result_index: 0 }, { result_index: 1 }, { result_index: 2 }],
    config: null,
  }));
  assert.ok(analyzeTies(q6, 3, "first").conflicts.length > 0, "l'ancien mode alertait bien");
  assert.equal(analyzeTies(q6, 3, "answers").conflicts.length, 0);

  // 8 questions, 4 profils : le format le plus vendu.
  const q8 = Array.from({ length: 8 }, () => ({
    options: [0, 1, 2, 3].map((i) => ({ result_index: i })),
    config: null,
  }));
  assert.ok(analyzeTies(q8, 4, "first").conflicts.length > 0);
  assert.equal(analyzeTies(q8, 4, "answers").conflicts.length, 0);
});
