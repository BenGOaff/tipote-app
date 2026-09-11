// tests/logic/registre-illisible.test.mts
//
// "JE N'AI PAS PU REGARDER" N'EST PAS "IL N'Y A PERSONNE"
// (audit du 11 septembre 2026, à la question de Béné : "est-ce que je
// peux envoyer mes affiliés dessus sans risque ?")
//
// `lireLigneAffilie` ignorait l'erreur de ses deux selects : une lecture
// qui ratait rendait `null`, donc l'affilié passait pour INCONNU, donc
// `attributeSale` passait au candidat suivant et pouvait payer quelqu'un
// d'autre. Et la route répondait 200 sur `status: "error"`, donc
// l'appelant croyait la commission prise.
//
// Deux faits tenus ici, et un troisième sur les scripts du serveur.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { sansCommentaires } from "./aide/sansCommentaires.mts";

const ATTRIBUTION = sansCommentaires(readFileSync("lib/affiliate/attribution.ts", "utf8"));
const ROUTE = sansCommentaires(readFileSync("app/api/affiliate/attribute-sale/route.ts", "utf8"));

test("une lecture du registre qui rate LÈVE, elle ne rend pas « inconnu »", () => {
  const debut = ATTRIBUTION.indexOf("async function lireLigneAffilie(");
  const fin = ATTRIBUTION.indexOf("export class RegistreIllisible");
  assert.ok(debut > 0 && fin > debut);
  const corps = ATTRIBUTION.slice(debut, fin);
  assert.match(corps, /ancien\?\.error/);
  assert.match(corps, /throw new RegistreIllisible/);
  // Et le repli sur les anciennes colonnes reste : une migration pas
  // encore passee ne doit pas casser ce qui marchait.
  assert.match(corps, /select\(AFF_COLS\)/);
});

test("`attributeSale` traduit l'exception en `status: \"error\"`, que la route refuse en 503", () => {
  assert.match(ATTRIBUTION, /return \{ status: "error", error: message \};/);
  assert.match(ROUTE, /if \(result\.status === "error"\) \{[\s\S]*?status: 503/);
  assert.match(ROUTE, /registre_indisponible/);
});

test("LES SCRIPTS DE CONTRÔLE DÉMARRENT SUR LE NODE 20 DU SERVEUR", () => {
  // `node: bad option: --experimental-strip-types` (Béné, 11 septembre,
  // sur le serveur de Tiquiz, qui porte la meme version de Node).
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [nom, cmd] of Object.entries(pkg.scripts as Record<string, string>)) {
    if (!nom.startsWith("check:")) continue;
    assert.ok(!cmd.includes("--experimental-strip-types"), `${nom} ne demarre pas sur Node 20 : ${cmd}`);
  }
  assert.ok(pkg.devDependencies?.tsx);
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.ok(lock.packages?.["node_modules/tsx"]);
});
