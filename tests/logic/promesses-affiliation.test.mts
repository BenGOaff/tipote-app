// tests/logic/promesses-affiliation.test.mts
//
// CE QUE L'ESPACE AFFILIÉ ANNONCE DOIT ÊTRE CE QUE LE PROGRAMME PAIE.
//
// Audit du 27 août 2026, en vérifiant le tour guidé. Deux chiffres
// faux, tous les deux dans le sens qui fait renoncer un affilié :
//
//   - "cookie 90 jours" alors que REF_MAX_AGE_SECONDS vaut 365 jours
//     depuis le 26 août (décision Béné : "son cookie est posé pour
//     1 an sur le device de son prospect") ;
//   - "les 12 premiers mois de chaque abonnement" alors qu'AUCUN
//     plafond n'existe dans le chemin de paiement : commissionnerVente
//     part à chaque encaissement, sans compteur de mois. Béné, 26 août :
//     "on paye bien 40% chaque mois où le client reste abonné, pas une
//     seule fois... On arrête de payer s'il se barre c'est tout."
//
// C'est le défaut décrit en tête de lib/affiliate/commission.ts, dans
// l'autre sens : des chiffres écrits À LA MAIN dans six fichiers de
// langue, pendant que le paiement est un calcul. Il était réparti sur
// 11 chaînes et 6 langues.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LANGUES = ["fr", "en", "es", "it", "pt", "ar"] as const;

function dictionnaire(lang: string): string {
  return readFileSync(`app/affiliate/i18n/${lang}.ts`, "utf8");
}

test("aucune langue n'annonce plus un cookie de 90 jours", () => {
  const PERIMES = [
    /90 jours/,
    /90-day/,
    /90 days/,
    /90 días/,
    /90 giorni/,
    /90 dias/,
    /90 يوم/,
  ];
  for (const lang of LANGUES) {
    const src = dictionnaire(lang);
    for (const motif of PERIMES) {
      assert.ok(
        !motif.test(src),
        `${lang} : le cookie est annoncé à 90 jours (il dure 12 mois)`,
      );
    }
  }
});

test("aucune langue n'annonce un plafond de 12 mois sur les abonnements", () => {
  // "un premier an", "sur une première année" restent autorisés : ce
  // sont des HORIZONS de simulation, et ils sont dits comme tels.
  const PLAFONDS = [
    /12 premiers mois/,
    /premiers 12 mois/,
    /first 12 months/,
    /12 primeros meses/,
    /primeros 12 meses/,
    /primi 12 mesi/,
    /12 primi mesi/,
    /primeiros 12 meses/,
    /أول 12 شهرًا/,
    /12 شهراً الأولى/,
  ];
  for (const lang of LANGUES) {
    const src = dictionnaire(lang);
    for (const motif of PLAFONDS) {
      assert.ok(
        !motif.test(src),
        `${lang} : un plafond de 12 mois est annoncé, or le programme paie tant que le client reste`,
      );
    }
  }
});

test("le brief donné à l'IA ne réintroduit pas le plafond", () => {
  // Sinon tout le contenu généré pour les affiliés le répète, et le
  // faux chiffre ressort par une porte qu'aucun dictionnaire ne garde.
  const brief = readFileSync("lib/affiliate/generatorBrief.ts", "utf8");
  assert.ok(
    !/12 premiers mois/.test(brief),
    "le brief IA annonce encore un plafond de 12 mois",
  );
});

test("le rattachement à vie est dit là où on explique le dernier clic", () => {
  // "Le PREMIER rattachement gagne" (26 août) : une inscription
  // gratuite par un lien attache la personne à vie, et un clic plus
  // récent ne la reprend pas. Sans cette nuance, la règle affichée
  // ("c'est le dernier clic qui compte") est fausse dans le cas qui
  // vaut le plus cher à l'affilié.
  const fr = dictionnaire("fr");
  assert.match(fr, /rattachement-là est à vie/);
  assert.match(fr, /elle t'est rattachée à vie/);
});
