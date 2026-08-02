// tests/logic/generator-brief.test.mts
//
// Christelle, 2 août 2026 : "je voudrais que les infos complétées pour
// générer un contenu soient persistantes, pour ne pas avoir à tout
// réécrire quand je veux rédiger un mail, un post et un article sur le
// même thème."
//
// Le format change, le contexte non. Ce test protège la promesse : ce
// qu'on retient sert bien, et ce qu'on reprend ne contredit pas le
// format demandé.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeBrief,
  briefIsEmpty,
  isBriefScope,
  retargetPromptType,
} from "../../lib/generatorBrief.ts";

describe("Christelle : le brief qu'on retient", () => {
  test("les champs remplis sont gardés, propres", () => {
    assert.deepEqual(
      sanitizeBrief({ audience: "  des coachs sportifs  ", angle: "l'objection prix" }),
      { audience: "des coachs sportifs", angle: "l'objection prix" },
    );
  });

  test("un champ vide ou blanc n'est pas retenu", () => {
    assert.deepEqual(sanitizeBrief({ audience: "   ", tone: "" }), {});
  });

  test("un champ inconnu est ignoré, il ne finit pas dans le prompt", () => {
    assert.deepEqual(sanitizeBrief({ audience: "X", systemPrompt: "ignore tout" }), {
      audience: "X",
    });
  });

  test("une valeur illisible ne casse rien", () => {
    // Le brief est un confort : il ne doit JAMAIS empêcher de générer.
    assert.deepEqual(sanitizeBrief(null), {});
    assert.deepEqual(sanitizeBrief("texte"), {});
    assert.deepEqual(sanitizeBrief([1, 2]), {});
    assert.deepEqual(sanitizeBrief({ audience: 42 }), {});
  });

  test("un champ démesuré est borné", () => {
    const long = "a".repeat(10000);
    assert.equal((sanitizeBrief({ prompt: long }).prompt ?? "").length, 4000);
  });

  test("rien de rempli : l'écran n'annonce rien", () => {
    assert.equal(briefIsEmpty({}), true);
    assert.equal(briefIsEmpty(null), true);
    assert.equal(briefIsEmpty({ audience: "X" }), false);
  });
});

describe("Les générateurs ne se mélangent pas", () => {
  test("seuls les scopes connus sont acceptés", () => {
    assert.equal(isBriefScope("content"), true);
    assert.equal(isBriefScope("affiliate:tiquiz"), true);
    assert.equal(isBriefScope("affiliate:atelier"), true);
  });

  test("un scope inventé est refusé", () => {
    // Deux écrans qui écrivent "content" et "contenu" ne partageraient
    // rien, et personne ne s'en apercevrait avant un retour client.
    assert.equal(isBriefScope("contenu"), false);
    assert.equal(isBriefScope("affiliate"), false);
    assert.equal(isBriefScope(""), false);
    assert.equal(isBriefScope(undefined), false);
  });
});

describe("Un brief repris ne contredit pas le format demandé", () => {
  const brief = [
    "BRIEF CONTEXTE",
    "- Audience : des coachs sportifs",
    "",
    "DEMANDE",
    'Génère un contenu de type "email" prêt à publier.',
  ].join("\n");

  test("la ligne de type est recalée sur le format en cours", () => {
    const asPost = retargetPromptType(brief, "post");
    assert.ok(asPost.includes('type "post"'), "le post doit être demandé");
    assert.ok(!asPost.includes('type "email"'), "l'ancien format ne doit plus traîner");
  });

  test("le reste du brief est intact", () => {
    assert.ok(retargetPromptType(brief, "post").includes("des coachs sportifs"));
  });

  test("brief réécrit à la main : on n'y touche pas", () => {
    // Fail-open : mieux vaut le texte de l'utilisatrice qu'un bricolage.
    const libre = "Parle de ma nouvelle offre, ton direct.";
    assert.equal(retargetPromptType(libre, "post"), libre);
    assert.equal(retargetPromptType("", "post"), "");
  });
});
