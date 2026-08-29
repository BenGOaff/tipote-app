// tests/logic/commission-croisee.test.mts
//
// LES COMMISSIONS SE CROISENT ENTRE L'ATELIER ET TIQUIZ.
//
// Béné, 26 août 2026 : "un mec qui vend l'atelier en affi doit bien sûr
// toucher ses commissions sur tiquiz si son affilié s'abonne et
// inversement pour l'atelier vendu via tiquiz."
//
// -- ÇA NE MARCHAIT QUE DANS UN SENS, ET C'ÉTAIT INVISIBLE ------------
//
// Le rattachement d'un contact vit dans `affiliate_conversions`, et
// `attributeSale` le LISAIT sans jamais l'écrire. Une inscription
// gratuite en écrivait un ; une VENTE, non.
//
// Donc : Sophie achète l'Atelier par le lien de Marc. Marc touche ses
// 70 %. Trois mois plus tard Sophie s'abonne à Tiquiz depuis son
// compte, sans lien dans l'URL. La recherche par email ne trouve rien,
// et Marc ne touche rien, alors qu'il a amené la cliente.
//
// Le rattachement vaut pour LA PERSONNE, pas pour le produit : c'est ce
// qui fait que les deux sens fonctionnent, chacun au taux de son
// produit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMISSION_RATES } from "../../lib/affiliate/commission.ts";
import {
  ATTRIBUTION_A_VIE,
  planchierRattachement,
} from "../../lib/affiliate/fenetreAttribution.ts";

const SOURCE = readFileSync(
  join(process.cwd(), "lib/affiliate/attribution.ts"),
  "utf-8",
);

test("chaque produit a SON taux, et ils ne se confondent pas", () => {
  assert.equal(COMMISSION_RATES.atelier, 0.7);
  assert.equal(COMMISSION_RATES.tiquiz, 0.4);
});

test("le rattachement est À VIE", () => {
  // Sans ça, le croisement ne marcherait que quelques mois : c'est
  // justement quand la vente met du temps à mûrir qu'il compte.
  assert.equal(ATTRIBUTION_A_VIE, true);
  assert.equal(planchierRattachement(Date.now()), null);
});

test("une vente attribuée ÉCRIT le rattachement", () => {
  // C'est le trou : la fonction lisait `affiliate_conversions` et n'y
  // écrivait jamais.
  assert.match(
    SOURCE,
    /from\("affiliate_conversions"\)\s*\.insert\(/,
    "attributeSale doit écrire le rattachement après avoir attribué",
  );
});

test("elle n'écrase JAMAIS un rattachement existant", () => {
  // Le PREMIER gagne : un contact appartient à celui qui l'a AMENÉ, pas
  // au dernier qui lui a vendu quelque chose.
  assert.match(
    SOURCE,
    /if \(!conversion\) \{[\s\S]*?affiliate_conversions/,
    "l'écriture doit être gardée par l'absence de conversion",
  );
});

test("le rattachement ne fait jamais échouer la commission", () => {
  // La commission vient d'être écrite : elle compte plus. Mais on ne se
  // tait pas, parce qu'un rattachement perdu coûte les ventes suivantes.
  const bloc = SOURCE.slice(SOURCE.indexOf("if (!conversion)"));
  assert.match(bloc.slice(0, 600), /console\.error/, "un échec doit crier");
  assert.doesNotMatch(
    bloc.slice(0, 600),
    /return \{ status: "error"/,
    "un rattachement raté ne doit pas annuler l'attribution",
  );
});

test("la conversion passe AVANT le lien de l'URL", () => {
  // "Le PREMIER rattachement gagne" : un cookie plus récent ne peut pas
  // reprendre un filleul à celui qui l'a amené.
  //
  // Ce test épinglait l'EXPRESSION `conversion?.sa ?? saDuRef`. Le 29
  // août, la cascade est devenue une liste de candidats essayés à tour
  // de rôle (un rattachement vers un `sa` inconnu bloquait tout le
  // reste). La RÈGLE n'a pas bougé, seule son écriture : un test qui
  // fige une syntaxe rougit sur une correction légitime et finit par
  // être contourné au lieu d'être lu.
  const liste = SOURCE.match(/const candidats = \[([^\]]+)\]/);
  assert.ok(liste, "la liste des candidats est introuvable");
  const ordre = liste![1].split(",").map((c) => c.trim());
  assert.deepEqual(
    ordre,
    ["conversion?.sa", "saDuRef", "saHint || null"],
    "l'ordre de résolution doit rester conversion -> ref -> sa",
  );
});
