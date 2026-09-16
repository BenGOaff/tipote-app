// tests/logic/champs-personnalises.test.mts
//
// Retour client, 16 septembre 2026 : "possibilité d'ajouter un champ
// personnalisé dans la capture des infos sur un quiz ou un sondage :
// l'user ajoute, personnalise le champ et le placeholder : la donnée est
// stockée, exploitée par l'analyse IA, les stats et exportée proprement."
//
// Le module pur décide (forme, identité, bornes, statistiques), et les
// écrans l'appellent. Ce test tient les DEUX moitiés : le comportement du
// module, et la source des écrans qui doivent le consommer. Un test qui
// ne tiendrait que la première passerait au vert sur un viewer qui
// n'envoie rien.
//
// Il est le MÊME dans les deux dépôts (Tiquiz et Tipote), et il s'adapte
// à ce que chacun porte : un garde-fou qui ne protège qu'un des deux
// jumeaux ne protège personne.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MAX_CHAMPS_PERSONNALISES,
  MAX_VALEUR_CHAMP,
  champsManquants,
  champsVisibles,
  colonnesChampsPersonnalises,
  lignesPromptChamps,
  nouvelIdChamp,
  sanitizeChampsPersonnalises,
  sanitizeValeursChamps,
  statsChamps,
  valeurChamp,
} from "@/lib/quiz/champsPersonnalises";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (p: string) => sansCommentaires(readFileSync(p, "utf8"));

const ville = { id: "cf_ab12cd", label: "Ta ville", placeholder: "Paris", required: true };
const metier = { id: "cf_metier01", label: "Ton métier", placeholder: "", required: false };

test("un champ garde son IDENTITE : renommer le libelle ne perd pas la valeur du lead", () => {
  const lead = { custom_fields: { cf_ab12cd: "Lyon" } };
  const renomme = { ...ville, label: "Ville" };
  assert.equal(valeurChamp(lead.custom_fields, renomme.id), "Lyon");
  assert.deepEqual(colonnesChampsPersonnalises([{ custom_fields: [renomme] }]), [{ id: "cf_ab12cd", label: "Ville" }]);
});

test("sanitize ne leve JAMAIS, borne, dedoublonne, et jette ce qui n'a pas d'id valide", () => {
  assert.deepEqual(sanitizeChampsPersonnalises(null), []);
  assert.deepEqual(sanitizeChampsPersonnalises("x"), []);
  assert.deepEqual(sanitizeChampsPersonnalises([{ id: "pas-un-id", label: "x" }]), []);
  const long = "a".repeat(500);
  const [c] = sanitizeChampsPersonnalises([{ id: "cf_ab12cd", label: long, placeholder: long, required: "oui" }]);
  assert.equal(c.label.length, 60);
  assert.equal(c.placeholder.length, 100);
  assert.equal(c.required, false, "required est un vrai booleen, jamais une chaine lue comme vraie");
  const doublons = sanitizeChampsPersonnalises([ville, ville, metier]);
  assert.equal(doublons.length, 2);
  const trop = sanitizeChampsPersonnalises(Array.from({ length: 12 }, (_, i) => ({ id: nouvelIdChamp(`abcdef${i}`), label: "x" })));
  assert.equal(trop.length, MAX_CHAMPS_PERSONNALISES);
});

test("un champ SANS libelle est garde en base et jamais montre au visiteur", () => {
  const champs = sanitizeChampsPersonnalises([ville, { ...metier, label: "  " }]);
  assert.equal(champs.length, 2, "l'autosave passe a chaque frappe : jeter le champ le ferait disparaitre sous les yeux de la creatrice");
  assert.deepEqual(champsVisibles(champs).map((c) => c.id), ["cf_ab12cd"]);
  assert.deepEqual(champsManquants(champs, {}).map((c) => c.id), ["cf_ab12cd"], "un champ invisible ne peut pas etre manquant");
});

test("les valeurs du visiteur : seuls les ids connus, bornees, sans retour a la ligne", () => {
  const v = sanitizeValeursChamps(
    { cf_ab12cd: " Lyon\n", cf_metier01: "x".repeat(1000), cf_inconnu9: "pirate", "": "vide" },
    [ville, metier],
  );
  assert.deepEqual(Object.keys(v).sort(), ["cf_ab12cd", "cf_metier01"]);
  assert.equal(v.cf_ab12cd, "Lyon");
  assert.equal(v.cf_metier01.length, MAX_VALEUR_CHAMP);
  assert.deepEqual(sanitizeValeursChamps([["cf_ab12cd", "x"]], [ville]), {}, "un tableau n'est pas une carte de valeurs");
  assert.deepEqual(sanitizeValeursChamps({ cf_ab12cd: "   " }, [ville]), {}, "une valeur vide n'est pas ecrite");
});

test("champsManquants ne reclame que l'obligatoire non rempli", () => {
  assert.deepEqual(champsManquants([ville, metier], { cf_ab12cd: "Lyon" }), []);
  assert.deepEqual(champsManquants([ville, metier], { cf_metier01: "coach" }).map((c) => c.id), ["cf_ab12cd"]);
});

test("nouvelIdChamp rend toujours un id que sanitize accepte", () => {
  for (const graine of ["", "A-B_C", "zz", "0123456789abcdefghij", "éàù"]) {
    const id = nouvelIdChamp(graine);
    assert.equal(sanitizeChampsPersonnalises([{ id, label: "x" }]).length, 1, `graine ${JSON.stringify(graine)} -> ${id}`);
  }
});

test("les statistiques et le prompt sortent de la MEME fonction, et un quiz sans champ n'ajoute rien", () => {
  const leads = [
    { custom_fields: { cf_ab12cd: "Lyon", cf_metier01: "Coach" } },
    { custom_fields: { cf_ab12cd: "lyon " } },
    { custom_fields: { cf_ab12cd: "Paris" } },
    { custom_fields: null },
  ];
  const stats = statsChamps([ville, metier], leads);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].remplis, 3);
  assert.equal(stats[0].total, 4);
  assert.deepEqual(stats[0].top[0], { valeur: "Lyon", n: 2 }, "la casse et les espaces ne font pas deux valeurs");
  const lignes = lignesPromptChamps(stats);
  assert.ok(lignes[0].startsWith("CHAMPS PERSONNALISES"));
  assert.ok(lignes.some((l) => l.includes("Ta ville : rempli par 3/4 (75%)")));
  assert.deepEqual(lignesPromptChamps([]), []);
  assert.deepEqual(lignesPromptChamps(statsChamps([ville], [])), [], "aucun lead : rien a dire au modele");
});

test("les colonnes d'export couvrent PLUSIEURS quiz, un id une colonne, le premier libelle gagne", () => {
  const cols = colonnesChampsPersonnalises([
    { custom_fields: [ville] },
    { custom_fields: [{ ...ville, label: "Ville (copie)" }, metier] },
    { custom_fields: "illisible" },
  ]);
  assert.deepEqual(cols, [
    { id: "cf_ab12cd", label: "Ta ville" },
    { id: "cf_metier01", label: "Ton métier" },
  ]);
});

// ---------------------------------------------------------------------------
// La SOURCE : chaque ecran consomme le module, aucun ne reecrit la regle.
// ---------------------------------------------------------------------------

test("le viewer public affiche les champs, valide l'obligatoire et les ENVOIE", () => {
  const src = lire("components/quiz/PublicQuizClient.tsx");
  assert.ok(src.includes("champsVisibles(sanitizeChampsPersonnalises(quiz.custom_fields))"), "le rendu passe par champsVisibles");
  assert.ok(src.includes("custom_fields: customValues"), "le corps envoye porte custom_fields");
  assert.equal((src.match(/champsManquants\(/g) ?? []).length, 2, "les DEUX chemins de validation (capture avant / apres) verifient l'obligatoire");
  assert.ok(src.includes("customFieldRequiredError"), "le message nomme le champ manquant");
  const n = (src.match(/customFieldRequiredError: "/g) ?? []).length;
  assert.ok(n >= 8, `la phrase existe dans les 8 tables de langue du viewer (${n})`);
});

test("la capture ecrit custom_fields sur le lead, avec le repli si la colonne manque", () => {
  const src = lire("app/api/quiz/[quizId]/public/route.ts");
  assert.ok(src.includes("sanitizeValeursChamps("), "les valeurs sont nettoyees contre les champs du quiz");
  assert.ok(src.includes("ecrireLead({ ...colonnesAffiliate, ...colonnesChamps })"));
  assert.ok(/Object\.keys\(colonnesChamps\)\.length > 0 && colonneInconnue\(error\)/.test(src), "une colonne absente coute les valeurs, jamais le lead");
});

test("le PATCH accepte custom_fields, le nettoie, et survit a une migration pas encore passee", () => {
  const src = lire("app/api/quiz/[quizId]/route.ts");
  assert.ok(/"custom_fields",/.test(src), "dans allowedFields");
  assert.ok(src.includes("patch.custom_fields = sanitizeChampsPersonnalises(patch.custom_fields)"));
  assert.ok(src.includes('"custom_fields" in patch') && src.includes("repli sans custom_fields"));
});

test("la charge publique tente custom_fields dans les colonnes RECENTES, jamais dans la liste stable", () => {
  const p = existsSync("lib/quiz/chargerQuizPublic.ts") ? "lib/quiz/chargerQuizPublic.ts" : "app/api/quiz/[quizId]/public/route.ts";
  const src = lire(p);
  assert.ok(/QUIZ_COLS_NEW = "[^"]*custom_fields/.test(src), "dans QUIZ_COLS_NEW");
  const stable = src.split("\n").find((l) => l.includes("const QUIZ_COLS ="));
  assert.ok(stable && !stable.includes("custom_fields"), "pas dans QUIZ_COLS : une colonne absente y ferait repondre 404 a tous les quiz");
});

test("les deux editeurs portent le champ dans l'instantane d'autosave, la sauvegarde et le composant partage", () => {
  for (const p of ["components/quiz/QuizDetailClient.tsx", "components/quiz/SurveyDetailClient.tsx"]) {
    const src = lire(p);
    assert.ok(src.includes("<ChampsPersonnalisesEditor"), `${p} : le composant partage`);
    assert.ok(src.includes("custom_fields: customFields"), `${p} : la sauvegarde et l'instantane`);
    assert.ok(src.includes("setCustomFields(sanitizeChampsPersonnalises(q.custom_fields))"), `${p} : le chargement passe par sanitize`);
    assert.ok(src.includes("champsVisibles(customFields).map"), `${p} : l'apercu suit la MEME regle que le viewer`);
  }
  const snap = lire("lib/quiz/editorSnapshot.ts");
  assert.equal((snap.match(/"custom_fields",/g) ?? []).length, 2, "dans les DEUX listes d'instantane");
});

test("le composant d'edition ne fabrique pas son propre format d'id", () => {
  const src = lire("components/quiz/ChampsPersonnalisesEditor.tsx");
  assert.ok(src.includes("nouvelIdChamp("));
  assert.ok(!/id:\s*`cf_/.test(src), "un id ecrit a la main divergerait du format que le serveur accepte");
});

test("l'analyse IA lit les champs par la meme fonction que l'ecran de statistiques", () => {
  const ins = lire("lib/quiz/insights.ts");
  assert.ok(ins.includes("statsChamps(") && ins.includes("lignesPromptChamps("));
  const qra = lire("components/quiz/QuizResultsAnalytics.tsx");
  assert.ok(qra.includes("statsChamps("), "les statistiques passent par statsChamps");
  assert.ok(qra.includes("champsAffiches.map"), "une colonne par champ dans la table des leads");
});

test("aucune phrase des nouvelles cles ne porte de tiret cadratin, dans les 7 langues", () => {
  for (const lang of ["fr", "en", "es", "it", "pt", "pt-BR", "ar"]) {
    const d = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
    const ns = d.quizEditor ?? d.quizDetail;
    for (const k of ["customFieldsTitle", "customFieldAdd", "customFieldLabelPh", "customFieldPlaceholderPh", "customFieldRequired", "customFieldRemove", "customFieldsMax", "customFieldUnnamed"]) {
      assert.equal(typeof ns[k], "string", `${lang}.${k}`);
      assert.ok(!/[—–]/.test(ns[k]), `${lang}.${k} porte un tiret cadratin`);
    }
    assert.equal(typeof (d.quizDetail ?? ns).customFieldFilled, "string", `${lang}.customFieldFilled`);
  }
});
