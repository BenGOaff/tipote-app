// tests/logic/recompense-affilies.test.mts
//
// Béné, 25 août 2026 : "possible de récompenser un affilié qui est aussi
// membre ? Genre : il a 10 affiliés abonnés, son abonnement baisse de
// 10 %, il en a 20 il gagne 20 %, il en a 100 ben il paye plus rien ?"
// Et : "on pourra laisser le choix à l'affilié : soit réduire le prix de
// son abonnement, soit augmenter ses commissions [...] il peut switcher
// quand il veut (ce sera pris en compte pour le mois suivant)."

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COMMISSION_BASE_PCT,
  COMMISSION_MAX_PCT,
  effetDuChangement,
  prochaineMarche,
  recompenseDuMois,
  remiseAbonnementPct,
  tauxCommissionPct,
} from "../../lib/affiliate/recompense.ts";

// ── Les trois chiffres que Béné a donnés ─────────────────────────────

test("10 filleuls = -10 %, 20 = -20 %, 100 = gratuit", () => {
  assert.equal(remiseAbonnementPct(10), 10);
  assert.equal(remiseAbonnementPct(20), 20);
  assert.equal(remiseAbonnementPct(100), 100);
});

test("entre deux marches, rien ne bouge", () => {
  // Par marches de 10 : c'est plus lisible sur une page de vente, et ça
  // évite d'annoncer "-37 %" à quelqu'un qui repassera à "-36 %" le mois
  // suivant.
  assert.equal(remiseAbonnementPct(0), 0);
  assert.equal(remiseAbonnementPct(9), 0);
  assert.equal(remiseAbonnementPct(19), 10);
  assert.equal(remiseAbonnementPct(37), 30);
});

test("la remise ne dépasse jamais 100 %", () => {
  // Au delà, on rembourserait quelqu'un pour être abonné.
  assert.equal(remiseAbonnementPct(150), 100);
  assert.equal(remiseAbonnementPct(100000), 100);
});

test("la commission monte de 5 points par marche de 10, jusqu'à 70 %", () => {
  // Béné, mot pour mot : "0 affilié : 40 %, 1 à 10 affiliés : 45 %,
  // 11 à 20 : 50 %, 21 à 30 : 55 %, etc, jusqu'à 70 %."
  assert.equal(tauxCommissionPct(0), COMMISSION_BASE_PCT);
  assert.equal(tauxCommissionPct(1), 45);
  assert.equal(tauxCommissionPct(10), 45);
  assert.equal(tauxCommissionPct(11), 50);
  assert.equal(tauxCommissionPct(20), 50);
  assert.equal(tauxCommissionPct(21), 55);
  assert.equal(tauxCommissionPct(30), 55);
  assert.equal(tauxCommissionPct(60), COMMISSION_MAX_PCT);
  // Le plafond tient : au delà, la marge ne couvre plus les frais de
  // paiement et le service.
  assert.equal(tauxCommissionPct(1000), COMMISSION_MAX_PCT);
});

test("les DEUX échelles ne se découpent pas pareil, et c'est voulu", () => {
  // La commission s'ouvre au PREMIER filleul, la remise d'abonnement
  // attend le DIXIÈME. Ce sont les deux formulations de Béné, et les
  // aligner de force reviendrait à changer un chiffre qu'elle a donné.
  // Ce test existe pour que la différence se lise au lieu de se
  // découvrir en production.
  assert.equal(tauxCommissionPct(1), 45);
  assert.equal(remiseAbonnementPct(1), 0);
  assert.equal(tauxCommissionPct(9), 45);
  assert.equal(remiseAbonnementPct(9), 0);
  assert.equal(tauxCommissionPct(10), 45);
  assert.equal(remiseAbonnementPct(10), 10);
});

test("un décompte absurde vaut zéro filleul, jamais une récompense", () => {
  for (const n of [null, undefined, -5, NaN, Infinity, "beaucoup"]) {
    assert.equal(remiseAbonnementPct(n), 0, `remise sur ${n}`);
    assert.equal(tauxCommissionPct(n), COMMISSION_BASE_PCT, `commission sur ${n}`);
  }
});

// ── Un seul des deux, jamais les deux ────────────────────────────────

test("choisir l'abonnement laisse la commission à sa base", () => {
  // C'est la MÊME récompense versée de deux façons. Les cumuler paierait
  // deux fois le même mérite : une commission plus forte ET un abonnement
  // moins cher, sur le même filleul.
  const r = recompenseDuMois("abonnement", 20);
  assert.equal(r.remiseAboPct, 20);
  assert.equal(r.commissionPct, COMMISSION_BASE_PCT);
});

test("choisir les commissions laisse l'abonnement au prix plein", () => {
  const r = recompenseDuMois("commissions", 20);
  assert.equal(r.remiseAboPct, 0);
  assert.equal(r.commissionPct, 50);
});

test("un choix illisible retombe sur les commissions", () => {
  // Le seul des deux qui ne peut rien casser : il augmente ce qu'on doit
  // sur des ventes déjà amenées, quand une remise d'abonnement posée par
  // erreur ampute un revenu récurrent.
  for (const c of [null, undefined, "", "autre", 42]) {
    const r = recompenseDuMois(c as never, 20);
    assert.equal(r.choix, "commissions", `choix ${String(c)}`);
    assert.equal(r.remiseAboPct, 0);
  }
});

// ── Ce que l'écran doit pouvoir dire ─────────────────────────────────

test("l'affilié voit la marche suivante approcher", () => {
  // Une récompense qu'on ne voit pas approcher ne motive personne.
  assert.deepEqual(prochaineMarche("abonnement", 7), { manque: 3, valeur: 10 });
  assert.deepEqual(prochaineMarche("abonnement", 20), { manque: 10, valeur: 30 });
  assert.deepEqual(prochaineMarche("commissions", 7), { manque: 4, valeur: 50 });
  // Au maximum, on n'annonce plus rien : promettre une marche qui
  // n'existe pas serait pire que se taire.
  assert.equal(prochaineMarche("abonnement", 100), null);
  assert.equal(prochaineMarche("commissions", 61), null);
});

test("changer de choix vaut pour LE MOIS SUIVANT, et l'écran le dit", () => {
  // Béné : "il peut switcher quand il veut, ce sera pris en compte pour
  // le mois suivant." La récompense est recalculée une fois par mois et
  // le recalcul lit le choix du moment : il n'y a donc pas de date
  // d'effet à stocker, mais l'écran doit être honnête là-dessus.
  assert.equal(effetDuChangement("commissions", "abonnement"), "le-mois-prochain");
  assert.equal(effetDuChangement("abonnement", "commissions"), "le-mois-prochain");
  assert.equal(effetDuChangement("commissions", "commissions"), "aucun-changement");
});

// ── La base ──────────────────────────────────────────────────────────

test("la migration borne les deux nombres qui décident de l'argent", () => {
  const sql = readFileSync(
    "supabase/migrations/20260825_recompense_affilies.sql",
    "utf8",
  );
  assert.match(sql, /recompense_choix text not null default 'commissions'/i);
  assert.match(sql, /check \(recompense_choix in \('commissions', 'abonnement'\)\)/i);
  // Des bornes EN BASE, pas seulement dans le code.
  assert.match(sql, /recompense_remise_pct between 0 and 100/i);
  assert.match(sql, /recompense_commission_pct between 0 and 70/i);
  assert.match(sql, /notify pgrst/i);
});
