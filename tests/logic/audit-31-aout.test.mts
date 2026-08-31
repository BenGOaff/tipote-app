// tests/logic/audit-31-aout.test.mts
//
// L'AUDIT DU 31 AOÛT, CÔTÉ AFFILIATION.
//
// Béné : "vérifier que chaque affilié reçoit les bonnes infos, que le
// système lui attribue bien ses clients et qu'il sera payé pour son
// travail sans perdre de commission. Je vais démarcher de très gros
// affiliés, je ne peux pas me permettre de proposer un système
// instable."
//
// Deux défauts, et les deux ne se voient qu'à L'ÉCHELLE, c'est à dire
// exactement quand un gros affilié arrive.
//
//  1. **Le tableau de bord annonçait un chiffre jamais versé.**
//     `affiliate_stats` sommait les commissions de TOUS les statuts, y
//     compris `cancelled`, posé depuis le 26 août sur chaque
//     remboursement. L'écart n'apparaissait qu'au premier virement, et
//     un gros affilié ne revient pas dessus. Pire, "En attente" ne
//     comptait que `pending` : entre J+30 et le virement du 10, son
//     argent n'était NI en attente NI payé.
//  2. **Le lot du mois lisait le registre en UNE requête.** Un
//     `.in("sa", [...])` part dans l'URL, un `sa` fait jusqu'à 80
//     caractères, et la commission est RÉCURRENTE : le jour où le lot
//     réunit assez d'affiliés, la requête est refusée. L'erreur était
//     IGNORÉE, donc plus personne n'était reconnu, donc tout le monde
//     sortait en "affiliée inconnue" et le lot était vide.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import {
  construireLot,
  type AffilieePayable,
  type CommissionAVerser,
} from "@/lib/affiliate/versement";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const vue = lire("supabase/migrations/20260831_affiliate_stats_honnetes.sql");
const store = lire("lib/affiliate/versementStore.ts");
const ecran = lire("app/affiliate/page.tsx");

// ── 1. LA VUE DIT CE QUI EST ACQUIS ──────────────────────────────────

describe("Le tableau de bord n'annonce plus un chiffre jamais versé", () => {
  test("UNE COMMISSION ANNULÉE SORT DU TOTAL", () => {
    // C'est le défaut : un remboursement pose `cancelled`, et la ligne
    // restait dans "Gains totaux".
    assert.match(
      vue,
      /sum\(commission_cents\) filter \(where status not in \('cancelled', 'rejected'\)\)/,
    );
  });

  test("ET UNE VENTE ANNULÉE N'EST PLUS UNE VENTE", () => {
    // `BadgesCard` fête la 1re, la 10e, la 25e vente : une vente
    // remboursée déclenchait un badge.
    assert.match(vue, /count\(\*\) filter \(where status not in \('cancelled', 'rejected'\)\)/);
  });

  test("le gagné-pas-encore-versé COUVRE LE TROU ENTRE J+30 ET LE VIREMENT", () => {
    assert.match(
      vue,
      /filter \(where status in \('pending', 'approved'\)\)[\s\S]{0,40}a_venir_commission_cents/,
    );
  });

  test("l'annulé est COMPTÉ à part, pour pouvoir être dit", () => {
    // Règle du 25 août sur les lignes écartées d'un lot : une somme qui
    // disparaît en silence est une décision qu'on ne peut plus
    // expliquer six mois plus tard.
    assert.match(
      vue,
      /filter \(where status in \('cancelled', 'rejected'\)\)[\s\S]{0,45}cancelled_commission_cents/,
    );
  });

  test("la vue recharge le schéma, sinon PostgREST ne voit rien", () => {
    assert.match(vue, /notify pgrst, 'reload schema';/);
  });
});

describe("L'écran affiche ce que la vue calcule", () => {
  test("En attente porte le gagné-pas-encore-versé", () => {
    assert.match(ecran, /stats\.a_venir_commission_cents \?\? stats\.pending_commission_cents/);
  });

  test("IL SURVIT À LA MIGRATION PAS ENCORE PASSÉE", () => {
    // Un écran qui plante en attendant serait pire que le chiffre qu'il
    // corrige. Les deux champs sont optionnels et ont un repli.
    assert.match(ecran, /a_venir_commission_cents\?: number \| null;/);
    assert.match(ecran, /cancelled_commission_cents\?: number \| null;/);
  });

  test("l'annulé ne s'affiche QUE s'il y en a", () => {
    // Un zéro permanent ferait croire à un problème là où il n'y en a
    // aucun.
    assert.match(ecran, /\(stats\.cancelled_commission_cents \?\? 0\) > 0 &&/);
  });
});

// ── 2. LE LOT DU MOIS ────────────────────────────────────────────────

describe("Le lot du mois ne se casse pas quand les affiliés se multiplient", () => {
  test("LE REGISTRE SE LIT PAR PAQUETS", () => {
    assert.match(store, /lireAffilieesParPaquets/);
    assert.match(store, /const PAQUET_AFFILIEES = 100;/);
  });

  test("UNE LECTURE RATÉE ARRÊTE TOUT, elle ne rend pas un lot partiel", () => {
    // Sans ce garde-fou, une erreur ignorée donnait `null`, donc AUCUNE
    // affiliée connue, donc tout le monde en "affiliee-inconnue" : un
    // écran qui accuse le registre de ne pas connaître des gens
    // parfaitement inscrits.
    assert.match(store, /if \(!lecture\.ok\) \{/);
    assert.match(store, /lot NON prepare/);
    // L'ancienne lecture d'un bloc, sans contrôle d'erreur, ne revient pas.
    assert.doesNotMatch(store, /const \{ data: affs \} = await supabaseAdmin/);
  });

  test("et l'erreur de chaque paquet est NOMMÉE", () => {
    assert.match(store, /registre illisible sur le paquet/);
  });
});

// ── 3. CE QUE LE LOT FAIT D'UNE AFFILIÉE INTROUVABLE ─────────────────

describe("Une affiliée introuvable est écartée EN LE DISANT", () => {
  const commission = (sa: string, cents: number): CommissionAVerser => ({
    id: `c-${sa}`,
    sa,
    status: "approved",
    commission_cents: cents,
    currency: "EUR",
    sale_at: "2026-07-01T00:00:00.000Z",
    payout_id: null,
  });

  test("son montant reste VISIBLE, il ne disparaît pas", () => {
    const lot = construireLot([commission("sa1", 5000)], []);
    assert.equal(lot.lignes.length, 0);
    assert.equal(lot.ecartees.length, 1);
    assert.equal(lot.ecartees[0].raison, "affiliee-inconnue");
    assert.equal(lot.ecartees[0].montantCents, 5000);
  });
});
