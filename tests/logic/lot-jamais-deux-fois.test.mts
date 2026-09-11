// tests/logic/lot-jamais-deux-fois.test.mts
//
// UN LOT NE PAIE JAMAIS DEUX FOIS, ET CE QUI EST PARTI À TORT SE VOIT.
//
// Audit du 11 septembre 2026, suite : Béné veut « un système ultra
// fiable de l'arrivée sur le site à la commande, en passant par les
// accès, les paiements et l'affiliation ». Trois trous d'argent vivaient
// dans le versement, et les trois ne se voyaient que dans `pm2 logs` :
//
// 1. `figerLot` crée le lot PUIS marque les commissions `paid`. Un
//    marquage raté laissait des commissions `approved` sans `payout_id`,
//    que le lot SUIVANT reprenait : le même virement partait deux fois.
// 2. Annuler un lot ne touchait qu'au statut du lot : ses commissions
//    restaient `paid`, donc l'affilié n'était JAMAIS payé, en silence.
// 3. Une commission déjà versée qu'un remboursement annule (`trop-tard`)
//    n'était écrite nulle part en base.
//
// Ce qui suit fige les trois décisions PURES, puis exige que les
// modules qui parlent à la base les appellent.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { compensationAEcrire } from "@/lib/affiliate/annulation";
import { lireCoordonnees, peutEtrePayee } from "@/lib/affiliate/coordonnees";
import {
  commissionsDejaDansDesLots,
  construireLot,
  reouvertureDeLot,
  type AffilieePayable,
  type CommissionAVerser,
} from "@/lib/affiliate/versement";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const source = (rel: string) => sansCommentaires(lire(rel));

const IBAN_FR = "FR1420041010050500013M02606";

function affiliee(sa: string): AffilieePayable {
  const coordonnees = lireCoordonnees({
    payout_method: "virement", iban_holder: "Marie Dupont", iban_number: IBAN_FR,
  });
  return {
    sa, email: `${sa}@exemple.fr`, displayName: "Marie Dupont",
    coordonnees, payable: peutEtrePayee(coordonnees), statut: "active", profilComplet: true,
  };
}
function commission(sa: string, id: string, cents: number, sur: Partial<CommissionAVerser> = {}): CommissionAVerser {
  return { id, sa, status: "approved", commission_cents: cents, sale_at: "2026-07-01T10:00:00Z", ...sur };
}

describe("1. Un lot figé porte déjà la commission : elle ne repart pas", () => {
  test("écartée, DITE, et jamais dans les lignes", () => {
    // c1 est dans le fichier SEPA du lot précédent, dont le marquage a
    // raté : elle est `approved`, sans `payout_id`. Sans le garde, elle
    // repartirait, et Marie serait virée deux fois.
    const lot = construireLot(
      [commission("sa1", "c1", 3000), commission("sa1", "c2", 2500)],
      [affiliee("sa1")],
      undefined,
      { dejaDansUnLot: new Map([["c1", "lot-precedent"]]) },
    );
    assert.equal(lot.totalCents, 2500);
    assert.deepEqual(lot.lignes[0]?.commissionIds, ["c2"]);
    const ecartee = lot.ecartees.find((e) => e.raison === "deja-dans-un-lot");
    assert.ok(ecartee, "l'écart doit être DIT, jamais avalé");
    assert.equal(ecartee.montantCents, 3000);
    assert.deepEqual(ecartee.commissionIds, ["c1"]);
  });

  test("sans la liste, le comportement d'avant ne bouge pas", () => {
    const lot = construireLot([commission("sa1", "c1", 3000)], [affiliee("sa1")]);
    assert.equal(lot.totalCents, 3000);
    assert.equal(lot.ecartees.length, 0);
  });

  test("commissionsDejaDansDesLots lit les lots, saute les annulés, tolère l'illisible", () => {
    const carte = commissionsDejaDansDesLots([
      { id: "lot-a", statut: "exporte", lignes: [{ commissionIds: ["c1", "c2"] }] },
      // Un lot ANNULÉ n'a payé personne : ses commissions sont libres.
      { id: "lot-b", statut: "annule", lignes: [{ commissionIds: ["c3"] }] },
      { id: "lot-c", statut: "prepare", lignes: "pas un tableau" },
      { id: "lot-d", statut: "paye", lignes: [{ commissionIds: [42, "", "c4"] }, null] },
    ]);
    assert.equal(carte.get("c1"), "lot-a");
    assert.equal(carte.get("c2"), "lot-a");
    assert.equal(carte.has("c3"), false);
    assert.equal(carte.get("c4"), "lot-d");
    assert.equal(carte.size, 3);
  });

  test("preparerLot LIT les lots, RÉPARE le marquage, et passe la liste au constructeur", () => {
    const src = source("lib/affiliate/versementStore.ts");
    // La lecture des lots précède la construction du lot.
    const lecture = src.indexOf('.neq("statut", "annule")');
    const construction = src.indexOf("construireLot(commissions, affiliees");
    assert.ok(lecture > 0 && construction > lecture, "les lots se lisent AVANT de construire");
    assert.match(src, /construireLot\(commissions, affiliees, undefined, \{ dejaDansUnLot \}\)/);
    assert.match(src, /await reparerMarquage\(commissions, dejaDansUnLot\)/);
    // Une lecture ratée ARRÊTE : pas de lot construit sans savoir ce que
    // les précédents ont pris.
    assert.match(src, /if \(lotsErr\) \{[\s\S]{0,300}return null;/);
  });
});

describe("2. Annuler un lot rouvre ses commissions", () => {
  test("un lot préparé ou exporté se rouvre, un lot payé ou annulé non", () => {
    assert.equal(reouvertureDeLot("prepare"), "reouvrir");
    assert.equal(reouvertureDeLot("exporte"), "reouvrir");
    assert.equal(reouvertureDeLot("paye"), "refuser");
    assert.equal(reouvertureDeLot("annule"), "refuser");
    // Un statut illisible : on ne rouvre pas de l'argent sur un doute.
    assert.equal(reouvertureDeLot(null), "refuser");
    assert.equal(reouvertureDeLot("n_importe_quoi"), "refuser");
  });

  test("marquerLot rouvre les commissions AVANT d'annuler le lot, et refuse un lot payé", () => {
    const src = source("lib/affiliate/versementStore.ts");
    const bloc = src.slice(src.indexOf("export async function marquerLot"));
    assert.match(bloc, /reouvertureDeLot\(/);
    const rouvre = bloc.indexOf('.update({ status: "approved", paid_at: null, payout_id: null })');
    const annule = bloc.indexOf("const maj: Record<string, unknown> = { statut }");
    assert.ok(rouvre > 0 && annule > rouvre, "les commissions se rouvrent AVANT le statut du lot");
    assert.match(bloc, /\.eq\("payout_id", id\)/);
  });
});

describe("3. Trop-tard s'écrit en base, une seule fois", () => {
  test("ce qu'on note, et zéro ou déjà noté rend null", () => {
    const t = Date.parse("2026-09-11T10:00:00Z");
    assert.deepEqual(compensationAEcrire({ commission_cents: 567 }, "remboursement", t), {
      a_compenser_cents: 567,
      a_compenser_depuis: "2026-09-11T10:00:00.000Z",
      a_compenser_motif: "remboursement",
    });
    // Un webhook rejoué ne doit pas doubler la somme à récupérer.
    assert.equal(compensationAEcrire({ commission_cents: 567, a_compenser_cents: 567 }, "remboursement", t), null);
    assert.equal(compensationAEcrire({ commission_cents: 0 }, "impaye", t), null);
    assert.equal(compensationAEcrire({ commission_cents: null }, "fraude", t), null);
  });

  test("le store l'écrit dans le cas trop-tard, et la migration porte les colonnes", () => {
    const store = source("lib/affiliate/annulationStore.ts");
    assert.match(store, /compensationAEcrire\(/);
    const tropTard = store.indexOf("sortie.tropTard += 1");
    const note = store.indexOf("await noterCompensation(l, args.motif)");
    assert.ok(tropTard > 0 && note > tropTard, "la note suit le comptage trop-tard");
    const migration = lire("supabase/migrations/20260911_commissions_a_compenser.sql");
    for (const col of ["a_compenser_cents", "a_compenser_depuis", "a_compenser_motif", "a_compenser_regle_le"]) {
      assert.match(migration, new RegExp(`add column if not exists ${col}`));
    }
    assert.match(migration, /notify pgrst, 'reload schema'/);
  });

  test("l'admin la voit, et « je n'ai pas pu lire » n'est pas « rien à compenser »", () => {
    const route = source("app/api/affiliate/admin/versements/route.ts");
    assert.match(route, /lireACompenser\(\)/);
    assert.match(route, /compensation_reglee/);
    const client = lire("app/affiliate/admin/versements/VersementsClient.tsx");
    assert.match(client, /aCompenser\.lisible === false/);
    assert.match(client, /n'ont pas pu être lues/);
    assert.match(client, /"deja-dans-un-lot":/);
  });
});

describe("Le cron de maturation", () => {
  test("il existe, il exige le secret en temps constant, et il appelle la même fonction que le bouton", () => {
    const src = source("app/api/cron/approuver-commissions/route.ts");
    assert.match(src, /x-cron-secret/);
    assert.match(src, /timingSafeEqual/);
    assert.match(src, /approuverCommissionsMures\(\)/);
    assert.match(src, /status: 401/);
  });
});
