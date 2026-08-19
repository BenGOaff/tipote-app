// tests/logic/affiliate-commission.test.mts
//
// "70% ... SOIT 32,90 € PAR VENTE À 47 €" (ce que l'app promettait)
// contre 70% du HT, soit 27,42 € (ce que le code calculait).
//
// 5,48 € d'écart par vente, et c'est le montant le PLUS ÉLEVÉ qui était
// affiché. La cause n'était pas une faute de frappe : les montants
// annoncés étaient des chaînes écrites à la main dans six fichiers de
// langue et dans un simulateur, pendant que le paiement était un calcul.
//
// Décision Béné du 19 août 2026 : la base est le HT, la baisse est
// assumée, et l'écran dit que le montant se calcule sur le HT.
//
// Ce test garde les deux moitiés ensemble : le calcul, et le fait que
// plus personne n'écrive un montant de commission à la main.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  COMMISSION_BASE,
  COMMISSION_RATES,
  PRICES_TTC_EUR,
  REFERENCE_VAT_RATE,
  commissionCents,
  commissionEur,
  htFromTtcCents,
  resolveCommissionRate,
  yearlyRecurringEur,
} from "../../lib/affiliate/commission.ts";

test("la base du programme est le HT", () => {
  assert.equal(COMMISSION_BASE, "ht");
});

test("le cas qui a tout declenche : 47 EUR TTC donnent 27,42 EUR", () => {
  const montant = commissionEur({
    ttcEur: PRICES_TTC_EUR.atelier,
    rate: COMMISSION_RATES.atelier,
    base: "ht",
  });
  assert.equal(montant, 27.42);
  // Et surtout : ce n'est PAS l'ancien montant annonce.
  assert.notEqual(montant, 32.9);
});

test("les montants annonces aux affiliees, un par un", () => {
  const ht = (ttcEur: number, rate: number) => commissionEur({ ttcEur, rate, base: "ht" });
  assert.equal(ht(PRICES_TTC_EUR.tiquiz_monthly, COMMISSION_RATES.tiquiz), 5.67);
  assert.equal(ht(PRICES_TTC_EUR.tiquiz_monthly_plus, COMMISSION_RATES.tiquiz), 9.67);
  assert.equal(ht(PRICES_TTC_EUR.tiquiz_yearly, COMMISSION_RATES.tiquiz), 56.67);
  assert.equal(ht(PRICES_TTC_EUR.tiquiz_yearly_plus, COMMISSION_RATES.tiquiz), 96.67);
});

test("un an d'abonnement = 12 commissions MENSUELLES, pas la commission d'un an", () => {
  // Chaque echeance produit sa propre ligne, donc son propre arrondi.
  // 12 x 5,67 = 68,04, et non 68,00 (= 40% du HT de 204 EUR). Afficher
  // 68,00 annoncerait 4 centimes de moins que ce qui sera verse.
  const an = yearlyRecurringEur({
    monthlyTtcEur: PRICES_TTC_EUR.tiquiz_monthly,
    rate: COMMISSION_RATES.tiquiz,
    base: "ht",
  });
  assert.equal(Number(an.toFixed(2)), 68.04);
  const anPlus = yearlyRecurringEur({
    monthlyTtcEur: PRICES_TTC_EUR.tiquiz_monthly_plus,
    rate: COMMISSION_RATES.tiquiz,
    base: "ht",
  });
  assert.equal(Number(anPlus.toFixed(2)), 116.04);
});

test("le HT se deduit du TTC, arrondi UNE seule fois", () => {
  assert.equal(htFromTtcCents(4700, 0.2), 3917); // 47 EUR -> 39,17
  assert.equal(htFromTtcCents(1700, 0.2), 1417); // 17 EUR -> 14,17
  // Sans TVA, le HT vaut le TTC : c'est le cas d'un vendeur en franchise.
  assert.equal(htFromTtcCents(4700, 0), 4700);
});

test("le taux de TVA change le HT, donc la commission", () => {
  // Prix fixe TTC + taux par pays = commission variable. C'est voulu,
  // et c'est pour ca que l'ecran annonce "sur le montant hors taxes".
  const fr = commissionEur({ ttcEur: 47, rate: 0.7, base: "ht", vatRate: 0.2 });
  const be = commissionEur({ ttcEur: 47, rate: 0.7, base: "ht", vatRate: 0.21 });
  const hu = commissionEur({ ttcEur: 47, rate: 0.7, base: "ht", vatRate: 0.27 });
  assert.ok(fr > be && be > hu, `${fr} / ${be} / ${hu} : l'ordre est faux`);
  assert.equal(REFERENCE_VAT_RATE, 0.2);
});

test("la base est un PARAMETRE, elle change vraiment le resultat", () => {
  // La lecon de la fausse alerte de Véronique : une mecanique devinee a
  // l'interieur d'une fonction finit appliquee au mauvais cas. Ici elle
  // est passee par l'appelant, et les deux valeurs different.
  const ht = commissionEur({ ttcEur: 47, rate: 0.7, base: "ht" });
  const ttc = commissionEur({ ttcEur: 47, rate: 0.7, base: "ttc" });
  assert.equal(ttc, 32.9);
  assert.notEqual(ht, ttc);
});

test("fail-open : rien d'absurde ne produit un montant absurde", () => {
  for (const mauvais of [0, -47, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(commissionCents({ ttcCents: mauvais, rate: 0.7, base: "ht" }), 0);
    assert.equal(commissionCents({ ttcCents: 4700, rate: mauvais, base: "ht" }), 0);
  }
});

test("AUCUN montant de commission n'est ecrit a la main dans une traduction", () => {
  // C'est la seule chose qui empeche vraiment le retour du bug : les
  // anciens montants etaient des chaines, donc ils ne pouvaient pas
  // suivre le calcul.
  const anciens = ["32,90", "32.90", "6,80", "6.80", "11,60", "11.60", "81,60", "81.60", "139,20", "139.20"];
  const dossier = path.join(process.cwd(), "app/affiliate/i18n");
  const fautifs: string[] = [];

  for (const nom of fs.readdirSync(dossier)) {
    if (!nom.endsWith(".ts")) continue;
    const src = fs.readFileSync(path.join(dossier, nom), "utf8");
    src.split("\n").forEach((ligne, i) => {
      for (const montant of anciens) {
        if (ligne.includes(montant)) fautifs.push(`${nom}:${i + 1} contient ${montant}`);
      }
    });
  }

  assert.deepEqual(fautifs, [], `montants TTC encore ecrits en dur :\n${fautifs.join("\n")}`);
});

test("les 6 langues disent que la commission porte sur le HT", () => {
  // Demande Béné : "tu annonces uniquement que le montant est sur le HT."
  const MENTION: Record<string, string> = {
    "fr.ts": "hors taxes",
    "en.ts": "excluding tax",
    "es.ts": "sin impuestos",
    "it.ts": "al netto delle imposte",
    "pt.ts": "sem impostos",
    "ar.ts": "غير شامل الضريبة",
  };
  const dossier = path.join(process.cwd(), "app/affiliate/i18n");

  for (const [fichier, mention] of Object.entries(MENTION)) {
    const src = fs.readFileSync(path.join(dossier, fichier), "utf8");
    const lignes = src
      .split("\n")
      .filter((l) => l.includes("faq_avg_earnings_a:") || l.includes("faq_subscriptions_a:"));
    assert.equal(lignes.length, 2, `${fichier} : ${lignes.length} entrees au lieu de 2`);
    for (const ligne of lignes) {
      assert.ok(ligne.includes(mention), `${fichier} ne mentionne pas le HT : ${ligne.slice(0, 120)}`);
      assert.ok(!/[—–]/.test(ligne), `${fichier} : tiret long dans un texte lu par l'affiliee`);
    }
  }
});

test("le simulateur appelle la fonction, il ne recalcule pas", () => {
  // Il affichait `PRIX_TTC x TAUX`, donc 16,7% de trop. Un ecran qui
  // recalcule une decision au lieu d'appeler la fonction finit toujours
  // par mentir : quatrieme fois dans ce depot.
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/affiliate/revenus/RevenueCalculator.tsx"),
    "utf8",
  );
  assert.ok(
    src.includes('from "@/lib/affiliate/commission"'),
    "le simulateur n'importe pas la fonction de commission",
  );
  assert.ok(
    !/ATELIER_PRICE_EUR \* ATELIER_RATE|tiquizPrice \* TIQUIZ_RATE/.test(src),
    "le simulateur recalcule encore un montant a la main",
  );
});

test("le taux negocie a la main gagne, et le silence ne vaut pas zero", () => {
  // Demande Bene du 19 aout : pouvoir monter ou baisser un taux a la
  // main (partenariat). Trois etages, et `null` veut dire "je ne me
  // prononce pas", jamais 0% : ce serait la pire erreur possible sur de
  // l'argent.
  assert.equal(resolveCommissionRate({ product: "atelier" }), 0.7);
  assert.equal(resolveCommissionRate({ product: "atelier", override: null }), 0.7);
  assert.equal(resolveCommissionRate({ product: "atelier", override: 0.8 }), 0.8);
  assert.equal(resolveCommissionRate({ product: "tiquiz", tierRate: 0.5 }), 0.5);
  // L'override passe DEVANT le palier.
  assert.equal(resolveCommissionRate({ product: "tiquiz", override: 0.6, tierRate: 0.5 }), 0.6);
  // Une valeur absurde est ignoree, elle ne devient pas le taux.
  for (const absurde of [0, -1, 2, Number.NaN]) {
    assert.equal(resolveCommissionRate({ product: "tiquiz", override: absurde }), 0.4);
  }
});
