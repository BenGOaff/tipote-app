// tests/logic/corps-avale-par-cloudflare.test.mts
//
// UN 5xx DEVANT UN NAVIGATEUR PERD SA RAISON.
//
// Cloudflare sert nos six domaines et REMPLACE le corps d'un 5xx par sa
// propre page (`error code: 502`, en text/plain). Un ecran qui lit
// `reason` dans le JSON recoit alors `undefined` et retombe sur sa
// phrase generique : on aurait ecrit la raison pour rien. Mesure du
// 31 aout 2026, deux fois le meme jour, cote Tiquiz.
//
// Un 5xx ne se justifie que la ou un FOURNISSEUR doit reessayer, c'est a
// dire dans un webhook : un navigateur ne reessaie rien tout seul, donc
// le statut ne lui sert a rien et le corps lui sert a tout. Les 4xx
// RESTENT (401, 402, 403, 404, 429) : ils passent intacts et ils disent
// la bonne chose.
//
// -- POURQUOI CE TEST VIT AUSSI ICI (3 septembre 2026) -----------------
//
// Tiquiz a ete corrige le 31 aout, et son AGENTS.md notait les chemins
// IA comme "a reprendre". En allant les faire, mesure dans CE depot :
// les 5 memes routes y portaient les 20 memes sorties en 5xx. Le module
// quiz est jumeau, et un garde-fou qui ne protege qu'un des jumeaux ne
// protege personne.
//
// Et le defaut etait pire que le statut : `/api/quiz/generate` renvoyait
// `{ error: "Cle API Claude manquante cote serveur." }` et le client
// AFFICHAIT ce champ tel quel, donc une creatrice espagnole lisait une
// phrase francaise. Le serveur rend une RAISON, l'ecran dit comment la
// dire (regle du 3 aout, suppression d'un quiz).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

/** Les chemins IA qu'une creatrice atteint depuis son navigateur. */
const ECRANS = [
  "app/api/quiz/generate/route.ts",
  "app/api/quiz/[quizId]/rebalance/route.ts",
  "app/api/quiz/[quizId]/rewrite/route.ts",
  "app/api/quiz/gender-variants/route.ts",
  "app/api/quiz/idea-chat/route.ts",
];

for (const rel of ECRANS) {
  test(`${rel} : aucun 5xx, la raison doit arriver`, () => {
    const code = readFileSync(rel, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    assert.doesNotMatch(
      code,
      /status:\s*50\d/,
      "Cloudflare remplace le corps : la raison n'arriverait pas a l'ecran",
    );
  });
}

// Les 9 raisons doivent etre disables dans les 7 langues : le serveur
// n'envoie jamais de phrase, donc une raison sans traduction est une
// creatrice devant un message vide.
const RAISONS = [
  "busy",
  "too_long",
  "refused",
  "unreachable",
  "empty",
  "unreadable",
  "rate_limited",
  "not_configured",
  "generic",
];

for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
  test(`${loc} : les 9 raisons d'echec IA sont traduites`, () => {
    const d = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")) as {
      erreursIa?: Record<string, string>;
    };
    const bloc = d.erreursIa ?? {};
    const manquantes = RAISONS.filter((r) => !bloc[r] || !bloc[r].trim());
    assert.deepEqual(manquantes, [], `${loc} : des raisons n'ont pas de phrase`);
  });
}

// Une raison INCONNUE ne doit jamais s'afficher telle quelle : un ecran
// reste sur une ancienne version montrerait "not_configured" en toutes
// lettres a une creatrice.
test("le hook retombe sur generic, il n'affiche jamais la cle", () => {
  const src = readFileSync("hooks/useEchecIa.ts", "utf8");
  assert.match(src, /"generic"/, "aucun repli sur generic");
  assert.match(src, /CONNUES\.has/, "la raison n'est pas verifiee avant d'etre traduite");
});

// LES ECRANS NE RECOPIENT PLUS `error` NI UNE PHRASE EN DUR. C'est ce
// qui affichait "Cle API Claude manquante cote serveur.", "Une erreur
// est survenue." et "Erreur IA".
test("aucun ecran de generation n'affiche le champ error brut", () => {
  const ECRANS_IA = [
    "components/quiz/QuizFormClient.tsx",
    "components/quiz/SurveyFormClient.tsx",
    "components/quiz/QuizDetailClient.tsx",
    "components/quiz/SurveyDetailClient.tsx",
  ];
  const fautifs: string[] = [];
  for (const f of ECRANS_IA) {
    const code = readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    if (/(toast\.error|setRebalanceError)\(\s*(data|json|err|e)\?\.(error|message)/.test(code)) {
      fautifs.push(f);
    }
  }
  assert.deepEqual(fautifs, [], "un ecran recopie encore le message technique du serveur");
});
