// tests/logic/result-share.test.mts
//
// "LE LIEN POINTE VERS LA PAGE DE BIENVENUE, PAS VERS LE RÉSULTAT."
// (retour client, 7 août 2026)
//
// Ce qu'il a partagé :
//
//   J'ai identifié mon profil de stress dominant. Fais le test pour
//   découvrir le tien. https://quiz.tipote.com/q/type-stress-biologique?rp=aa87...
//
// -- LE LIEN N'ÉTAIT PAS LE PROBLÈME -----------------------------------
//
// Il porte bien `?rp=<profil>`, et il DOIT mener au quiz. Béné : "et pour
// chacun : lien vers le quiz." Celui qui reçoit le lien vient passer le
// test, pas lire le résultat de quelqu'un d'autre.
//
// Ce qui manquait, c'est que le TEXTE ne parlait pas du résultat obtenu :
// le visiteur partageait exactement la même phrase qu'avant de l'avoir.
// De son point de vue, il partageait donc "le quiz".
//
// -- ET C'EST ENCORE UNE MOITIÉ DE DÉCISION ----------------------------
//
// Le serveur, lui, faisait déjà le bon travail : depuis le 28 juillet,
// `og:title` vaut "J'ai obtenu : <profil>" et `og:image` porte l'image du
// profil. **Deux endroits calculaient la même chose, un seul avait été
// corrigé.** C'est mot pour mot ce que l'en-tête de `lib/quiz/shareText.ts`
// raconte déjà pour le HTML brut.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildResultShareText,
  buildShareText,
  mentionsResult,
} from "../../lib/quiz/shareText.ts";

/** Les phrases par défaut du viewer, en français tutoiement. */
const DEFAUTS = {
  withResult: (r: string) => `J'ai obtenu : ${r}. Et toi ? Fais le quiz pour le savoir :`,
  quizOnly: (t: string) => `Je viens de faire le quiz "${t}" ! Fais-le aussi :`,
};

test("le partage de resultat NOMME le profil obtenu", () => {
  // Le cas exact du client : son message de quiz est generique, il ne
  // peut pas nommer le profil. C'est la phrase par defaut qui doit le
  // faire.
  const texte = buildResultShareText(
    "J'ai identifié mon profil de stress dominant. Fais le test pour découvrir le tien.",
    "Le stress biologique",
    "Quel est ton type de stress ?",
    DEFAUTS,
  );
  assert.ok(texte.includes("Le stress biologique"), `le profil n'apparait pas : ${texte}`);
});

test("le partage AVANT le resultat parle du quiz, comme avant", () => {
  // Rien ne doit bouger sur l'ecran de partage qui debloque le bonus :
  // a ce moment la, le visiteur n'a pas encore son resultat.
  const texte = buildShareText(
    "J'ai identifié mon profil de stress dominant. Fais le test pour découvrir le tien.",
    "Quel est ton type de stress ?",
    DEFAUTS.quizOnly,
  );
  assert.equal(texte, "J'ai identifié mon profil de stress dominant. Fais le test pour découvrir le tien.");
});

test("la creatrice garde la main avec {resultat}", () => {
  const texte = buildResultShareText(
    "Je suis {resultat} au test de Béné, et toi ?",
    "Le stress biologique",
    "Quel est ton type de stress ?",
    DEFAUTS,
  );
  assert.equal(texte, "Je suis Le stress biologique au test de Béné, et toi ?");
});

test("plusieurs orthographes de la variable sont acceptees", () => {
  // Elle ecrit dans son elan, pas dans notre schema.
  for (const variable of ["{resultat}", "{résultat}", "{result}", "{profil}", "{RESULTAT}", "{ resultat }"]) {
    const texte = buildResultShareText(`Mon profil : ${variable} !`, "Le Fonceur", "Titre", DEFAUTS);
    assert.equal(texte, "Mon profil : Le Fonceur !", `non reconnue : ${variable}`);
  }
  assert.equal(mentionsResult("aucune variable ici"), false);
});

test("la variable est remplacee PARTOUT, pas seulement la premiere fois", () => {
  const texte = buildResultShareText("{resultat} ? Oui, {resultat}.", "Le Fonceur", "T", DEFAUTS);
  assert.equal(texte, "Le Fonceur ? Oui, Le Fonceur.");
});

test("sans profil connu, on retombe sur le texte du quiz", () => {
  // Fail-open : un partage sans texte serait pire qu'un texte generique.
  for (const vide of [null, undefined, "", "   "]) {
    const texte = buildResultShareText(null, vide, "Mon quiz", DEFAUTS);
    assert.equal(texte, 'Je viens de faire le quiz "Mon quiz" ! Fais-le aussi :');
  }
});

test("le HTML du champ riche ne part JAMAIS dans un post", () => {
  // Drame Béné du 3 aout : `share_message` et les titres sont des champs
  // riches. La regle vaut aussi pour le nom du profil, qui vient du meme
  // editeur WYSIWYG.
  const texte = buildResultShareText(
    null,
    '<div class="rt-field-fs" style="--rt-fs-d: 18px">Le stress&nbsp;biologique</div>',
    "T",
    DEFAUTS,
  );
  assert.ok(!texte.includes("<"), `du HTML dans le partage : ${texte}`);
  assert.ok(!texte.includes("rt-field-fs"));
  assert.ok(texte.includes("Le stress"), texte);
});

test("le texte tient sur UNE ligne", () => {
  // Dans un post, un texte sur cinq lignes pousse le lien hors de vue.
  const texte = buildResultShareText("Mon profil :\n{resultat}\n\nEt toi ?", "Le Fonceur", "T", DEFAUTS);
  assert.ok(!texte.includes("\n"), `saut de ligne conserve : ${JSON.stringify(texte)}`);
});

test("aucun tiret cadratin dans les phrases par defaut du viewer", () => {
  // Regle Béné du 7 juin, sur un texte que le visiteur colle publiquement.
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/quiz/PublicQuizClient.tsx"),
    "utf8",
  );
  const lignes = src
    .split("\n")
    .filter((l) => l.includes("defaultResultShareMessage: (result) =>"));
  assert.equal(lignes.length, 8, `attendu 8 langues, trouve ${lignes.length}`);
  for (const l of lignes) {
    assert.ok(!/[—–]/.test(l), `tiret long : ${l.trim()}`);
    assert.ok(l.includes("${result}"), `cette langue ne nomme pas le profil : ${l.trim()}`);
  }
});

test("les deux partages du viewer sont des cas EXPLICITES", () => {
  // La mecanique est un parametre, jamais deduite de la presence d'une
  // URL : c'est la lecon des controles "profil" appliques a un quiz
  // score (drame Véronique, 1er aout 2026).
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/quiz/PublicQuizClient.tsx"),
    "utf8",
  );
  assert.ok(
    /getShareData = \(scope: ShareScope/.test(src),
    "getShareData ne prend plus la mecanique en parametre",
  );
  // Et le texte comme le lien sortent de la MEME decision.
  assert.ok(
    /const resultShare = \(\): \{ scope: ShareScope; url: string \}/.test(src),
    "le texte et le lien du partage de resultat sont redevenus deux decisions",
  );
});
