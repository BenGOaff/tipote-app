// tests/logic/bareme-affiliation-source.test.mts
//
// CE DÉPÔT FAIT FOI SUR LE BARÈME D'AFFILIATION.
//
// Béné, 30 août 2026 : "mêmes données côté atelier et affiliate. En fait
// affiliate fait foi, et atelier reprend les chiffres d'affiliate. On ne
// doit pas mettre des données différentes, tout doit être fiable et
// cohérent."
//
// -- POURQUOI CE TEST EXISTE ICI ET PAS AILLEURS -----------------------
//
// Les taux et les marches vivent dans CE dépôt, qui est le seul qui
// PAIE. Deux autres endroits les AFFICHENT et ne peuvent pas les
// importer (dépôts séparés) :
//
//   - tiquiz : `lib/site/programmeAffiliation.ts` (les taux)
//     et `lib/site/recompenseAffiliation.ts` (les marches),
//     qui alimentent tiquiz.fr/affiliation et son simulateur ;
//   - l'Atelier : rien, il envoie `source_app: "atelier"` et c'est
//     `resolveRate` d'ici qui décide.
//
// Ce test FIGE les valeurs. Il ne peut pas lire l'autre dépôt, donc il
// ne prouve pas l'égalité : il garantit qu'un changement de barème ne
// passe pas INAPERÇU. Le message d'échec nomme les fichiers à corriger,
// pour que la question "et l'autre côté ?" se pose au bon moment plutôt
// qu'au premier virement d'un affilié.

import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMISSION_RATES } from "../../lib/affiliate/commission.ts";
import {
  COMMISSION_BASE_PCT,
  COMMISSION_MAX_PCT,
  COMMISSION_PAS_PCT,
  PALIER_FILLEULS,
  REMISE_ABO_MAX_PCT,
  remiseAbonnementPct,
  tauxCommissionPct,
} from "../../lib/affiliate/recompense.ts";
import { DELAI_RETRACTATION_JOURS, MONTANT_MINIMUM_CENTS } from "../../lib/affiliate/versement.ts";

const A_PORTER =
  "\n>>> Si ce chiffre a changé volontairement, il DOIT être porté dans le dépôt tiquiz :" +
  "\n    lib/site/programmeAffiliation.ts  (taux, seuils annoncés)" +
  "\n    lib/site/recompenseAffiliation.ts (marches du simulateur)" +
  "\n    et son test tests/logic/site-public.test.mts.";

test("les taux de commission sont ceux qu'annoncent les pages publiques", () => {
  assert.equal(COMMISSION_RATES.tiquiz, 0.4, "taux Tiquiz" + A_PORTER);
  assert.equal(COMMISSION_RATES.atelier, 0.7, "taux Atelier" + A_PORTER);
});

test("les marches de recompense sont celles du simulateur public", () => {
  assert.equal(PALIER_FILLEULS, 10, "taille d'une marche" + A_PORTER);
  assert.equal(COMMISSION_BASE_PCT, 40, "taux de base" + A_PORTER);
  assert.equal(COMMISSION_PAS_PCT, 5, "ce qu'ajoute une marche" + A_PORTER);
  assert.equal(COMMISSION_MAX_PCT, 70, "plafond" + A_PORTER);
  assert.equal(REMISE_ABO_MAX_PCT, 100, "remise maximale" + A_PORTER);
});

test("LES DEUX ECHELLES NE SE DECOUPENT PAS PAREIL, et c'est voulu", () => {
  // C'est l'ecart que le simulateur public doit reproduire au caractere
  // pres. Sa page Systeme.io annoncait l'inverse des deux cotes (45 % a
  // partir de 10 filleuls, 1 % de remise des le premier) : un simulateur
  // qui suivrait la page annoncerait une remise a quelqu'un qui touchera
  // zero.
  assert.equal(tauxCommissionPct(1), 45, "la marche de TAUX s'ouvre au 1er filleul" + A_PORTER);
  assert.equal(remiseAbonnementPct(9), 0, "la REMISE attend le 10e filleul" + A_PORTER);
  assert.equal(remiseAbonnementPct(10), 10);
  assert.equal(tauxCommissionPct(51), 70, "le plafond est atteint a 51 filleuls" + A_PORTER);
  assert.equal(remiseAbonnementPct(100), 100);
});

test("les seuils de versement sont ceux annonces publiquement", () => {
  assert.equal(DELAI_RETRACTATION_JOURS, 30, "delai avant versement" + A_PORTER);
  assert.equal(MONTANT_MINIMUM_CENTS, 2000, "minimum de versement" + A_PORTER);
});
