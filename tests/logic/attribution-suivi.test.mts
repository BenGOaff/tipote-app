// tests/logic/attribution-suivi.test.mts
//
// "QUI A ENVOYÉ QUI" : L'INSCRIPTION GRATUITE N'APPARAISSAIT NULLE PART.
//
// Béné, 31 août 2026 : "j'ai testé le ref de Nina : je ne suis pas
// taguée comme étant affiliée de Nina dans le suivi. Je ne peux jamais
// savoir qui a envoyé qui et qui a été envoyé par qui. Le système
// d'affiliation n'est pas fiable."
//
// Elle avait raison, et pour DEUX causes empilées.
//
// 1. La table "amené par" ne se construisait que sur
//    `affiliate_commissions`, c'est à dire sur les gens qui ont PAYÉ.
//    Une inscription GRATUITE par un lien affilié crée une CONVERSION,
//    pas une commission. Or c'est précisément la conversion qui
//    rattache quelqu'un À VIE (règle du 26 août). Les conversions
//    étaient déjà lues, simplement pas utilisées ici.
//
// 2. Côté Tiquiz, la fiche client cherchait cette table avec l'adresse
//    ENCODÉE de l'URL (`%40` pour `@`), donc la recherche échouait pour
//    tout le monde. Corrigé là-bas (`lib/admin/emailParam.ts`).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const ROUTE = readFileSync("app/api/partner/affilies/route.ts", "utf8");
const RATTACHER = readFileSync("app/api/affiliate/rattacher/route.ts", "utf8");

test("une inscription GRATUITE ecrit bien une conversion", () => {
  // C'est ce qui rend la correction utile : sans cette ecriture, il n'y
  // aurait rien a afficher.
  assert.match(RATTACHER, /from\("affiliate_conversions"\)\.insert\(/);
});

test("l'attribution se construit sur les CONVERSIONS, pas seulement sur les ventes", () => {
  const bloc = ROUTE.slice(ROUTE.indexOf("const attributions: Record<string, string> = {}"));
  const conversions = bloc.indexOf("convRes.data");
  const commissions = bloc.indexOf("commRes.data");
  assert.ok(conversions > -1, "les conversions ne servaient pas a construire l'attribution");
  assert.ok(commissions > -1, "les ventes historiques Systeme.io doivent rester couvertes");
  assert.ok(
    conversions < commissions,
    "les conversions passent DEVANT : sinon un acheteur ecraserait celui qui l'a amene",
  );
});

test("le PREMIER rattachement gagne, donc la lecture est ASCENDANTE", () => {
  // Un contact appartient a celui qui l'a AMENE, pas au dernier dont il
  // a croise un lien (regle du 26 aout, confirmee nommement par Bene).
  const select = ROUTE.slice(ROUTE.indexOf('from("affiliate_conversions")'));
  assert.match(select.slice(0, 300), /ascending: true/);
  assert.match(select.slice(0, 300), /created_at/, "sans la date, on ne peut pas departager");
});

test("on garde le plus ancien, on ne l'ecrase pas", () => {
  const bloc = ROUTE.slice(ROUTE.indexOf("const attributions: Record<string, string> = {}"));
  const gardes = bloc.match(/if \(!email \|\| attributions\[email\]\) continue;/g) ?? [];
  assert.equal(gardes.length, 2, "les deux boucles doivent respecter ce qui est deja attribue");
});
