// tests/logic/reponse-autre.test.mts
//
// "AUTRE : PRÉCISEZ" (idée de Damien, 27 août 2026).
//
// "Ajouter un vrai Autre dans les réponses des quiz et sondages, comme
// sur Google Form. Et il faut bien sûr que ce soit collecté et analysé,
// que ça apparaisse correctement dans les statistiques."
//
// Les deux moitiés comptent autant l'une que l'autre : un champ que le
// visiteur remplit et que personne ne lit est pire qu'une option en
// moins, parce qu'il fait croire à la créatrice qu'elle collecte
// quelque chose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTRE_TEXTE_MAX,
  autreAnswerLabel,
  autreTexteManquant,
  collectAutreTextes,
  isOtherPicked,
  otherOptionIndex,
  sanitizeAutreTexte,
} from "@/lib/quiz/otherOption";
import { formatSurveyAnswer } from "@/lib/survey/format";

const OPTIONS = [
  { text: "Coach" },
  { text: "Thérapeute" },
  { text: "Autre", is_other: true },
];

test("une question sans Autre se comporte exactement comme avant", () => {
  assert.equal(otherOptionIndex([{ text: "A" }, { text: "B" }]), -1);
  assert.equal(otherOptionIndex(null), -1);
  assert.equal(otherOptionIndex(undefined), -1);
  // Un JSONB peut contenir n'importe quoi : une entrée nulle ne doit pas
  // faire tomber le viewer public.
  assert.equal(otherOptionIndex([null, undefined, { text: "A" }]), -1);
});

test("une seule réponse Autre par question : la première gagne", () => {
  // Deux champs de texte pour un seul `text` en base, c'est le second
  // qui écrase le premier sans que personne le voie.
  const deux = [{ text: "A", is_other: true }, { text: "B", is_other: true }];
  assert.equal(otherOptionIndex(deux), 0);
});

test("choisir Autre sans rien écrire ne valide pas la question", () => {
  assert.equal(autreTexteManquant(OPTIONS, [2], ""), true);
  assert.equal(autreTexteManquant(OPTIONS, [2], "   "), true);
  assert.equal(autreTexteManquant(OPTIONS, [2], "sophrologue"), false);
  // Une réponse de la liste n'exige évidemment rien.
  assert.equal(autreTexteManquant(OPTIONS, [0], ""), false);
  // Multi-select : Autre coché parmi d'autres, le texte reste exigé.
  assert.equal(autreTexteManquant(OPTIONS, [0, 2], ""), true);
});

test("le texte saisi est borné et mis à plat", () => {
  assert.equal(sanitizeAutreTexte("  sophrologue  "), "sophrologue");
  // Un retour à la ligne collé casserait une cellule de CSV.
  assert.equal(sanitizeAutreTexte("coach\nsportif"), "coach sportif");
  assert.equal(sanitizeAutreTexte("a".repeat(500)).length, AUTRE_TEXTE_MAX);
  assert.equal(sanitizeAutreTexte(null), "");
  assert.equal(sanitizeAutreTexte(undefined), "");
});

test("Autre est une option comme les autres : elle se coche et se compte", () => {
  assert.equal(isOtherPicked(OPTIONS, [2]), true);
  assert.equal(isOtherPicked(OPTIONS, [0, 1]), false);
  assert.equal(isOtherPicked(OPTIONS, []), false);
  assert.equal(isOtherPicked(OPTIONS, null), false);
});

test("un export dit LE LIBELLÉ ET LE TEXTE, jamais l'un des deux", () => {
  // Le texte seul rendrait une colonne où l'on ne distingue plus une
  // réponse de la liste d'une réponse libre.
  assert.equal(autreAnswerLabel("Autre", "sophrologue"), "Autre : sophrologue");
  // Sans texte, le libellé suffit. Sans libellé, le texte vaut mieux
  // qu'un deux-points orphelin.
  assert.equal(autreAnswerLabel("Autre", ""), "Autre");
  assert.equal(autreAnswerLabel("", "sophrologue"), "sophrologue");
});

test("formatSurveyAnswer sort le texte du Autre, en simple et en multiple", () => {
  const q = { question_type: "multiple_choice", options: OPTIONS };
  assert.equal(
    formatSurveyAnswer(q, { option_index: 2, text: "sophrologue" }),
    "Autre : sophrologue",
  );
  assert.equal(formatSurveyAnswer(q, { option_index: 0 }), "Coach");
  assert.equal(
    formatSurveyAnswer(q, { option_indices: [0, 2], text: "sophrologue" }),
    "Coach | Autre : sophrologue",
  );
});

test("la synthèse ne ramasse que les textes de ceux qui ont coché Autre", () => {
  const reponses = [
    { option_index: 2, text: "sophrologue" },
    { option_index: 0 },
    { option_indices: [1, 2], text: "naturopathe" },
    // A coché Autre sans écrire : rien à lister, et la barre le compte
    // quand même (c'est le rôle de la barre, pas de cette liste).
    { option_index: 2, text: "  " },
    // Un texte posé à côté d'un choix qui n'est PAS Autre n'a rien à
    // faire ici : le jour où un écran en écrit un, il ne pollue pas.
    { option_index: 0, text: "parasite" },
  ];
  assert.deepEqual(collectAutreTextes(OPTIONS, reponses), ["sophrologue", "naturopathe"]);
  // Question sans Autre : rien, quoi qu'il y ait dans les réponses.
  assert.deepEqual(collectAutreTextes([{ text: "A" }], reponses), []);
});

// -- LES TROIS LISTES BLANCHES ----------------------------------------
//
// `quiz_questions.options` est du JSONB, donc aucune migration. MAIS le
// PATCH et les deux éditeurs recopient les options CHAMP PAR CHAMP : un
// drapeau absent de l'une des trois listes est perdu en silence à la
// sauvegarde. C'est exactement ce qui était arrivé à l'`image_url`
// d'Hugo en mai 2026, et ça ne se voit qu'après avoir tout ressaisi.

test("les deux éditeurs recopient le drapeau dans leur payload", () => {
  for (const f of [
    "components/quiz/QuizDetailClient.tsx",
    "components/quiz/SurveyDetailClient.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /\.\.\.\(o\.is_other \? \{ is_other: true \} : \{\}\)/,
      `${f} ne recopie pas is_other : cocher "Autre" ne survivrait pas à la sauvegarde`,
    );
  }
});

test("le PATCH ne reconstruit pas les options champ par champ", () => {
  // Ici (contrairement à Tiquiz) la route RECOPIE l'option entière avec
  // un spread, donc tout nouveau drapeau passe d'office. Le jour où
  // quelqu'un la réécrit en liste blanche, `is_other` serait perdu en
  // silence à la sauvegarde, comme l'image_url d'Hugo en mai 2026.
  const src = readFileSync("app/api/quiz/[quizId]/route.ts", "utf8");
  const bloc = src.slice(src.indexOf("options: Array.isArray(q.options)"));
  const entete = bloc.slice(0, bloc.indexOf("sort_order: i,"));
  assert.ok(
    entete.includes("...o,") || entete.includes("is_other"),
    "le PATCH recopie les options champ par champ sans nommer is_other",
  );
});

test("le viewer envoie le texte À CÔTÉ de l'index, dans le payload", () => {
  // Tipote n'a qu'UN constructeur de payload (Tiquiz en a deux, avec le
  // sondage anonyme). On compte ce qui existe ici : un chiffre recopié
  // du jumeau rougirait sans rien vouloir dire.
  const src = readFileSync("components/quiz/PublicQuizClient.tsx", "utf8");
  const occurrences = src.match(/option_index: ans\.optionIndex, \.\.\.\(ans\.text/g) ?? [];
  assert.equal(occurrences.length, 1, "le constructeur de payload oublie le texte");
  const multi = src.match(/option_indices: ans\.optionIndices, \.\.\.\(ans\.text/g) ?? [];
  assert.equal(multi.length, 1, "le constructeur oublie le texte en multi-select");
});

test("choisir Autre n'emporte pas le visiteur avant qu'il ait écrit", () => {
  // L'avance automatique d'un tap est ce qui rendait le champ
  // inutilisable : la question suivante s'affichait sous le doigt.
  const src = readFileSync("components/quiz/PublicQuizClient.tsx", "utf8");
  assert.match(src, /ans\.kind === "option" && ans\.text === undefined/);
});
