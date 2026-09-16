// tests/logic/consentement-sans-entite.test.mts
//
// Béné, 15 septembre 2026, sur la case de consentement d'un quiz public :
// "putain pourquoi j'ai encore du &nbsp; sur les pages publiques !!!
// Exactement le genre de trucs de merde qui me font perdre des clients
// tous les jours."
//
// La case affichait, en toutes lettres : `J'accepte la politique de
// confidentialité&nbsp;`. L'éditeur riche colle une entité sans balise,
// le viewer choisissait "texte" faute de balise, et React affiche une
// entité telle quelle dans un noeud de texte.
//
// Deux moitiés : la fonction pure qui décide de la forme et décode, et
// la SOURCE des deux viewers qui ne rend plus `raw`. Un test qui ne
// tiendrait que la première passerait au vert sur un écran qui continue
// d'afficher `&nbsp;`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decouperSurLeLibelle, formeDuConsentement } from "@/lib/quiz/consentement";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

test("ce que Bene a vu : une entite sans balise sort DECODEE, jamais en clair", () => {
  const f = formeDuConsentement("J'accepte la politique de confidentialité&nbsp;:");
  assert.equal(f.genre, "texte");
  if (f.genre !== "texte") throw new Error("forme");
  // `decodeHtmlEntities` rend l'INSECABLE (16 septembre 2026). Le
  // commentaire d'avant disait "un noeud de texte n'a pas besoin de
  // l'insecable pour ne pas couper" : c'est FAUX, un noeud de texte coupe
  // sur une espace ordinaire comme n'importe ou ailleurs, et on aurait
  // retire l'espace francaise qu'on venait d'inserer. Ce qui compte
  // reste : plus d'entite, et l'espace TOUJOURS la.
  assert.equal(f.texte, "J'accepte la politique de confidentialité\u00a0:");
  assert.ok(!f.texte.includes("&nbsp;"));
});

test("les autres entites du contentEditable sortent en caracteres", () => {
  const f = formeDuConsentement("J&#39;accepte &amp; je signe &quot;ici&quot;");
  assert.equal(f.genre, "texte");
  if (f.genre !== "texte") throw new Error("forme");
  assert.equal(f.texte, `J'accepte & je signe "ici"`);
});

test("une balise fait rendre en HTML, et on sait si l'auteur a pose son lien", () => {
  const sans = formeDuConsentement("<b>J'accepte</b> la politique&nbsp;:");
  assert.equal(sans.genre, "html");
  if (sans.genre !== "html") throw new Error("forme");
  assert.equal(sans.porteUnLien, false);
  // Le HTML garde son entite : c'est le navigateur qui la decode, et
  // sanitizeRichText la voit passer intacte.
  assert.ok(sans.html.includes("&nbsp;"));
  const avec = formeDuConsentement(`J'accepte la <a href="https://x.fr">politique</a>`);
  assert.equal(avec.genre, "html");
  if (avec.genre !== "html") throw new Error("forme");
  assert.equal(avec.porteUnLien, true);
});

test("le libelle se retrouve dans le texte decode, meme colle par un &nbsp;", () => {
  const f = formeDuConsentement("J'accepte la politique&nbsp;de confidentialité.");
  if (f.genre !== "texte") throw new Error("forme");
  const m = decouperSurLeLibelle(f.texte, "politique de confidentialité");
  // Avant, l'aiguille se cherchait dans le texte BRUT : `politique&nbsp;de`
  // ne la contenait pas, donc le lien partait a cote des mots au lieu de
  // dessus. Decode d'abord, elle se retrouve.
  // Le libelle rendu garde l'espace TELLE QU'ELLE EST DANS LE TEXTE :
  // on decoupe des tranches, on ne reecrit pas ce que la creatrice a
  // ecrit.
  assert.deepEqual(m, { avant: "J'accepte la ", libelle: "politique\u00a0de confidentialité", apres: "." });
  const ok = decouperSurLeLibelle("J'accepte la Politique de Confidentialité du site", "politique de confidentialité");
  assert.deepEqual(ok, { avant: "J'accepte la ", libelle: "Politique de Confidentialité", apres: " du site" });
  assert.equal(decouperSurLeLibelle("texte", ""), null);
});

test("aucun des deux viewers ne rend `raw` en texte : la forme vient du module", () => {
  const src = sansCommentaires(readFileSync("components/quiz/PublicQuizClient.tsx", "utf8"));
  const debut = src.indexOf("function ConsentText(");
  assert.ok(debut > 0, "ConsentText introuvable");
  const corps = src.slice(debut, src.indexOf("\n}\n", debut));
  assert.ok(corps.includes("formeDuConsentement(raw)"), "ConsentText doit passer par formeDuConsentement");
  assert.ok(corps.includes("decouperSurLeLibelle("), "le libelle se cherche dans le texte decode");
  assert.ok(!/\{raw\}/.test(corps), "`{raw}` rendu tel quel : une entite s'afficherait en clair");
  assert.ok(!/\.test\(raw\)/.test(corps), "la detection de balise vit dans le module, pas dans l'ecran");
});
