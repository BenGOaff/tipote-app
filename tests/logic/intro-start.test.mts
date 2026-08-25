// tests/logic/intro-start.test.mts
//
// Béné, 25 août 2026 : "j'aimerais proposer de commencer le quiz direct
// par une question, au lieu du CTA commencer le quiz." Puis, dans le
// même message : "étudie bien ça pour éviter de casser les quiz
// existants bien sûr. Et les stats."
//
// Les deux moitiés de sa phrase sont testées ici, et la première l'est
// en premier : un quiz en ligne ne doit pas bouger d'un pixel tant que
// sa créatrice n'a rien coché.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  accueilFusionne,
  introStartAvertissementStats,
  resolveIntroStart,
  startSurPremiereReponse,
  type IntroStartContexte,
} from "../../lib/quiz/introStart.ts";

const CTX: IntroStartContexte = {
  captureAvant: false,
  nbQuestions: 8,
  demandePrenom: false,
  demandeGenre: false,
};
const ctx = (p: Partial<IntroStartContexte> = {}): IntroStartContexte => ({ ...CTX, ...p });

// ── ON NE CASSE AUCUN QUIZ EXISTANT ─────────────────────────────────
//
// C'est le test qui compte le plus. La colonne n'existe pas encore en
// production : tant qu'elle n'y est pas, la valeur arrive `undefined`
// pour TOUS les quiz du monde. Si ce cas ne rendait pas exactement le
// comportement d'aujourd'hui, la migration casserait tous les quiz en
// ligne au moment ou elle serait appliquee.

test("colonne absente, null, valeur inconnue : le bouton, comme avant", () => {
  for (const brut of [undefined, null, "", "  ", "bouton", "Question", "QUESTION", 0, 1, true, {}, []]) {
    const d = resolveIntroStart(brut, ctx());
    assert.equal(d.mode, "button", `${JSON.stringify(brut)} aurait du tomber sur le bouton`);
    assert.equal(d.refus, null, "un defaut n'est pas un refus : rien a signaler a la creatrice");
  }
});

test("la valeur explicite \"button\" est un choix, pas un accident", () => {
  const d = resolveIntroStart("button", ctx());
  assert.equal(d.mode, "button");
  assert.equal(d.demande, "button");
});

// ── Les deux modes demandés ─────────────────────────────────────────

test("question : la premiere question remplace le bouton", () => {
  const d = resolveIntroStart("question", ctx());
  assert.deepEqual(d, { mode: "question", demande: "question", refus: null });
});

test("prenom : le champ remplace le bouton, si on demande quelque chose", () => {
  assert.equal(resolveIntroStart("personalize", ctx({ demandePrenom: true })).mode, "personalize");
  assert.equal(resolveIntroStart("personalize", ctx({ demandeGenre: true })).mode, "personalize");
});

// ── Un refus se DIT, il ne se tait pas ──────────────────────────────
//
// Une creatrice qui coche un reglage sans effet conclut que le bouton ne
// marche pas, et cherche ailleurs. C'est le scenario Jocelyne du 1er
// aout, et la regle du `ok: false` du 3 aout.

test("sondage qui capture l'email AVANT : la question ne peut pas passer devant", () => {
  const d = resolveIntroStart("question", ctx({ captureAvant: true }));
  assert.equal(d.mode, "button", "la reponse partirait avant qu'on sache a qui elle est");
  assert.equal(d.demande, "question", "ce qu'elle a demande ne se perd pas");
  assert.equal(d.refus, "capture-avant");
});

test("quiz sans question : rien a afficher", () => {
  const d = resolveIntroStart("question", ctx({ nbQuestions: 0 }));
  assert.equal(d.mode, "button");
  assert.equal(d.refus, "aucune-question");
});

test("prenom demande alors qu'on ne demande ni prenom ni genre", () => {
  const d = resolveIntroStart("personalize", ctx());
  assert.equal(d.mode, "button");
  assert.equal(d.refus, "rien-a-demander");
});

test("un refus porte TOUJOURS ce qui etait demande", () => {
  // Sans `demande`, l'editeur afficherait "bouton" et la creatrice
  // croirait que son choix ne s'est pas enregistre.
  for (const [brut, c] of [
    ["question", ctx({ captureAvant: true })],
    ["question", ctx({ nbQuestions: 0 })],
    ["personalize", ctx()],
  ] as const) {
    const d = resolveIntroStart(brut, c);
    assert.equal(d.demande, brut);
    assert.notEqual(d.refus, null);
    assert.equal(d.mode, "button");
  }
});

// ── LES STATS ────────────────────────────────────────────────────────

test("le demarrage se compte sur la premiere REPONSE, jamais sur le rendu", () => {
  // Le poser au rendu donnerait 100% de demarrages sur tous les quiz :
  // la fuite d'entree disparaitrait de l'ecran sans avoir disparu de la
  // realite, ce qui est pire que de ne rien afficher.
  assert.equal(startSurPremiereReponse("question"), true);
  assert.equal(startSurPremiereReponse("button"), false);
  assert.equal(startSurPremiereReponse("personalize"), false);
});

test("l'ecran de stats DIT que le quiz demarre sur une question", () => {
  // Deux periodes du meme quiz ne se comparent plus : c'est le piege
  // d'Adeline (un chiffre qui change de sens sous l'historique). Sans ce
  // signal, le jour du changement se lit comme un bond de performance.
  assert.equal(introStartAvertissementStats("question"), "demarrage-sur-question");
  assert.equal(introStartAvertissementStats("button"), null);
  assert.equal(introStartAvertissementStats("personalize"), null);
});

test("une seule fonction dit que l'accueil et la question 1 fusionnent", () => {
  // Le viewer s'en sert pour DEMARRER sur l'ecran de question, et cet
  // ecran s'en sert pour afficher le titre au dessus. Deux decisions
  // separees donneraient un accueil qui disparait sans que le titre
  // reapparaisse ailleurs.
  assert.equal(accueilFusionne("question"), true);
  assert.equal(accueilFusionne("button"), false);
  assert.equal(accueilFusionne("personalize"), false);
});

// ── La decision est PURE ────────────────────────────────────────────

test("le module ne lit ni la base ni l'environnement", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/quiz/introStart.ts", import.meta.url), "utf8");
  assert.ok(!/supabaseAdmin|process\.env|from "@supabase/.test(src),
    "un module qui importe supabaseAdmin n'est pas testable, donc il n'est pas teste");
});

// ── LE BRANCHEMENT : un module non branche ne sert a rien ────────────
//
// "Un garde-fou non fusionne ne protege personne" (22 aout). La meme
// chose vaut pour une decision : ecrite et non appelee, elle ne fait
// rien, et la doc la decrit pourtant comme active.

import { readFileSync } from "node:fs";

const lire = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const VIEWER = lire("../../components/quiz/PublicQuizClient.tsx");
const EDITEUR = lire("../../components/quiz/QuizDetailClient.tsx");
const PUBLIC_ROUTE = lire("../../app/api/quiz/[quizId]/public/route.ts");
const PATCH_ROUTE = lire("../../app/api/quiz/[quizId]/route.ts");
const MIGRATION = lire("../../supabase/migrations/20260825_intro_start_mode.sql");

test("les 7 endroits d'une nouvelle colonne sur quizzes sont faits", () => {
  // Section A de CLAUDE_PITFALLS : en zapper un rend la fonctionnalite
  // cassee EN SILENCE.
  assert.match(MIGRATION, /add column if not exists intro_start_mode/i, "1. migration");
  assert.match(MIGRATION, /notify pgrst, 'reload schema'/i, "2. cache de schema");
  assert.ok(PATCH_ROUTE.includes('"intro_start_mode"'), "3. liste blanche du PATCH");
  assert.ok(PUBLIC_ROUTE.includes("intro_start_mode"), "4. select public");
  assert.ok(EDITEUR.includes("setIntroStartMode"), "5. etat de l'editeur");
  assert.ok(EDITEUR.includes("intro_start_mode: introStartMode"), "6. payload de sauvegarde");
  assert.ok(VIEWER.includes("intro_start_mode?: string | null"), "7. type visiteur");
});

test("la colonne recente vit dans le select QUI PEUT ECHOUER", () => {
  // PostgREST refuse le select ENTIER sur une colonne inconnue. Ajoutee a
  // QUIZ_COLS, elle ferait repondre 404 a TOUS les quiz publics tant que
  // la migration n'est pas passee : c'est arrive le 2 juin, l'app est
  // restee offline deux heures.
  const ligneNew = PUBLIC_ROUTE.split("\n").find((l) => l.includes("QUIZ_COLS_NEW ="));
  assert.ok(ligneNew?.includes("intro_start_mode"), "la colonne doit etre dans QUIZ_COLS_NEW");
  const ligneStable = PUBLIC_ROUTE.split("\n").find((l) => l.includes("const QUIZ_COLS ="));
  assert.ok(!ligneStable?.includes("intro_start_mode"), "elle ne doit PAS etre dans la liste stable");
});

test("l'apercu de l'editeur appelle la fonction, il ne la recalcule pas", () => {
  // Septieme fois que ce defaut sort dans ce module. Un apercu qui
  // recalcule une decision du viewer finit toujours par mentir.
  assert.ok(EDITEUR.includes("resolveIntroStart"), "l'editeur n'appelle pas la decision");
  assert.ok(VIEWER.includes("resolveIntroStart"), "le viewer n'appelle pas la decision");
});

test("le viewer ne compte le demarrage que par la fonction", () => {
  assert.ok(VIEWER.includes("startSurPremiereReponse(introStart.mode)"));
  assert.ok(VIEWER.includes("accueilFusionne(introStart.mode)"));
});

test("l'ecran de stats DIT ce que demarrages veut dire", () => {
  const STATS = lire("../../components/quiz/QuizAnalyticsClient.tsx");
  assert.ok(STATS.includes("introStartAvertissementStats"), "la note n'est pas branchee");
  assert.ok(STATS.includes("introStartStatsNotice"), "la phrase n'est pas affichee");
});
