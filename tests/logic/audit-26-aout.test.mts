// tests/logic/audit-26-aout.test.mts
//
// L'AUDIT DU 26 AOÛT : CE QUI POUVAIT PARTIR EN TROP, ET CE QUI NE
// PARTAIT PAS DU TOUT.
//
// Béné : "je veux que tout soit fiable, stable, précis, inspiré des
// meilleures pratiques pour tous les cas de figure (upgrades downgrades,
// remboursement annulation demandes etc... auto affiliation factures
// affiliés, factures clients etc...)"
//
// Cinq trous, tous invisibles jusqu'à ce qu'un virement parte. Ils ont
// tous la même forme, celle du 1er août : **une logique écrite pour un
// cas, appliquée telle quelle à un autre.** Ce qui change depuis le
// 25 août, c'est le prix de l'erreur : c'est NOUS qui virons maintenant,
// et un virement ne se reprend pas.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { decideAnnulation, resultatVide } from "@/lib/affiliate/annulation";
import { memePersonne, normaliserAdresse } from "@/lib/affiliate/memeAdresse";
import { montantSioCents } from "@/lib/affiliate/montantSio";
import { COMMISSION_RATES, htFromTtcCents, resolveCommissionRate } from "@/lib/affiliate/commission";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// ── 1. UNE VENTE REMBOURSÉE NE PAIE PERSONNE ────────────────────────

describe("Une vente remboursée ne paie personne", () => {
  test("une commission qui n'est pas encore partie s'annule", () => {
    assert.equal(decideAnnulation({ statut: "pending", payoutId: null }), "annuler");
    assert.equal(decideAnnulation({ statut: "approved", payoutId: null }), "annuler");
  });

  test("UNE COMMISSION DÉJÀ VERSÉE NE SE RÉÉCRIT PAS", () => {
    // L'argent est parti, et la facture d'autofacturation qui le
    // justifie a été remise à un comptable. Réécrire la ligne ferait
    // mentir la pièce. C'est un cas pour un humain.
    assert.equal(decideAnnulation({ statut: "paid", payoutId: "lot-1" }), "trop-tard");
  });

  test("DANS UN LOT COMPTE AUTANT QUE LE STATUT", () => {
    // `figerLot` peut créer le lot et rater le marquage : la commission
    // reste `approved` en portant déjà un `payout_id`, et elle est dans
    // un fichier SEPA déposé à la banque. L'annuler la ferait
    // disparaître d'un virement déjà parti.
    assert.equal(decideAnnulation({ statut: "approved", payoutId: "lot-1" }), "trop-tard");
  });

  test("annuler deux fois n'est pas une erreur", () => {
    // Les fournisseurs rejouent leurs webhooks. Un remboursement traité
    // deux fois doit être silencieux, pas bruyant.
    assert.equal(decideAnnulation({ statut: "cancelled", payoutId: null }), "deja-close");
    assert.equal(decideAnnulation({ statut: "rejected", payoutId: null }), "deja-close");
  });

  test("un statut inconnu s'annule, il ne se laisse pas passer", () => {
    // Sur de l'argent qui SORT, l'inconnu se ferme. L'inverse laisserait
    // partir un versement sur une vente remboursée.
    assert.equal(decideAnnulation({ statut: null, payoutId: null }), "annuler");
    assert.equal(decideAnnulation({ statut: "n_importe_quoi", payoutId: "" }), "annuler");
  });

  test("le compte de départ est à zéro partout", () => {
    assert.deepEqual(resultatVide(), { annulees: 0, dejaCloses: 0, tropTard: 0, tropTardCents: 0 });
  });

  test("LA ROUTE EXIGE UN MOTIF, elle ne l'invente pas", () => {
    // "Annulée" sans raison ne s'explique pas à l'affilié le jour où il
    // demande pourquoi sa commission a sauté.
    const route = lire("app/api/affiliate/cancel-sale/route.ts");
    assert.match(route, /MOTIFS\.includes/);
    assert.match(route, /invalid_fields/);
    // Et la porte est la même que celle de l'attribution.
    assert.match(route, /x-affiliate-secret/);
    assert.match(route, /timingSafeEqual/);
  });

  test("LE STORE NE DÉCIDE RIEN, le module pur n'importe pas la base", () => {
    assert.ok(!lire("lib/affiliate/annulation.ts").includes("supabaseAdmin"));
    assert.match(lire("lib/affiliate/annulationStore.ts"), /decideAnnulation/);
  });

  test("on ne SUPPRIME jamais une commission annulée", () => {
    // L'affilié doit voir dans son historique que cette vente a été
    // remboursée. Une ligne qui disparaît sans un mot se lit comme un vol.
    const store = lire("lib/affiliate/annulationStore.ts");
    assert.match(store, /status: "cancelled"/);
    assert.ok(!/\.delete\(\)/.test(store), "le store supprime des lignes");
  });
});

// ── 2. L'AUTO-AFFILIATION, ALIAS COMPRIS ────────────────────────────

describe("S'affilier à soi même", () => {
  test("LES ALIAS GMAIL SONT LA MÊME BOÎTE", () => {
    assert.equal(normaliserAdresse("bene+tiquiz@gmail.com"), "bene@gmail.com");
    assert.equal(normaliserAdresse("b.e.n.e@gmail.com"), "bene@gmail.com");
    assert.ok(memePersonne("Bene+x@Gmail.com", "b.e.n.e@googlemail.com"));
  });

  test("AILLEURS, LES POINTS COMPTENT", () => {
    // `jean.dupont@` et `jeandupont@` peuvent être deux personnes chez
    // un hébergeur classique : les confondre refuserait une commission
    // légitime, ce qui est aussi grave que d'en payer une de trop.
    assert.ok(!memePersonne("jean.dupont@orange.fr", "jeandupont@orange.fr"));
    // Le `+` en revanche est une convention générale.
    assert.ok(memePersonne("jean+promo@orange.fr", "jean@orange.fr"));
  });

  test("une adresse vide n'est LA MÊME que personne", () => {
    assert.ok(!memePersonne("", ""));
    assert.ok(!memePersonne(null, undefined));
  });

  test("L'ATTRIBUTION UTILISE LA RÈGLE, plus une comparaison brute", () => {
    const src = lire("lib/affiliate/attribution.ts");
    assert.match(src, /memePersonne\(aff\.email, email\)/);
    // On regarde le CODE, pas la prose : le commentaire au dessus CITE
    // l'ancienne comparaison, et un test qui rougit sur un commentaire
    // finit desactive.
    assert.ok(
      !/if \(aff\.email\.toLowerCase\(\) === email\)/.test(src),
      "la comparaison brute est revenue",
    );
  });
});

// ── 3. LE TAUX ET LA BASE ───────────────────────────────────────────

describe("Combien on paie, et sur quoi", () => {
  test("LE TAUX VIENT DU MODULE, plus d'une constante à côté", () => {
    const src = lire("lib/affiliate/attribution.ts");
    assert.match(src, /resolveCommissionRate/);
    assert.ok(
      !/const TIQUIZ_COMMISSION_RATE = /.test(src),
      "le taux est de nouveau ecrit en dur dans l'attribution",
    );
    // Et il lit enfin la table des taux négociés, créée le 19 août et
    // qui n'était lue nulle part : un partenariat à 60 % aurait été payé
    // 40 % en silence.
    assert.match(src, /affiliate_rate_overrides/);
  });

  test("un taux négocié GAGNE, un taux absurde est ignoré", () => {
    assert.equal(resolveCommissionRate({ product: "tiquiz", override: 0.6 }), 0.6);
    assert.equal(resolveCommissionRate({ product: "tiquiz", override: 0 }), COMMISSION_RATES.tiquiz);
    assert.equal(resolveCommissionRate({ product: "tiquiz", override: 2 }), COMMISSION_RATES.tiquiz);
    assert.equal(resolveCommissionRate({ product: "tiquiz", override: null }), COMMISSION_RATES.tiquiz);
  });

  test("LA BASE EST UN PARAMÈTRE OBLIGATOIRE", () => {
    // Les trois appelants n'envoyaient pas la même chose dans
    // `sale_amount_cents` : nos checkouts du HT, les webhooks Systeme.io
    // du TTC. Le webhook de Tiquiz surpayait donc de ~20 %, en silence.
    const src = lire("lib/affiliate/attribution.ts");
    assert.match(src, /base: CommissionBase;/);
    assert.match(src, /input\.base === "ttc"/);
  });

  test("1,13 € par vente : le montant que l'écart coûtait", () => {
    // 40 % de 17,00 € font 6,80 € ; 40 % de 14,17 € font 5,67 €.
    const ttc = 1700;
    assert.equal(Math.round(ttc * 0.4), 680);
    assert.equal(Math.round(htFromTtcCents(ttc) * 0.4), 567);
  });

  test("UN APPELANT MUET EST LU COMME TTC, ET ÇA CRIE", () => {
    // Le repli est CONSERVATEUR : lire un HT comme du TTC sous-paie de
    // 17 %, ce qui se rattrape au lot suivant ; lire un TTC comme du HT
    // surpaie de 20 %, et un virement parti ne revient pas.
    const route = lire("app/api/affiliate/attribute-sale/route.ts");
    assert.match(route, /base \?\? "ttc"/);
    assert.match(route, /console\.error/);
  });
});

// ── 4. LE MONTANT LU DANS UN PAYLOAD SYSTEME.IO ─────────────────────

describe("Le montant d'une vente Systeme.io", () => {
  test('"17.00" vaut 17 EUROS, pas 17 centimes', () => {
    // `extractNumber` rendait 17, donc 17 centimes : la commission
    // valait 6 centimes au lieu de 6,80 EUR. La protection existait
    // côté Tiquiz depuis le 22 août et n'avait jamais été portée ici.
    assert.equal(montantSioCents("17.00"), 1700);
    assert.equal(montantSioCents("17,50"), 1750);
  });

  test("un entier qu'on vend vraiment est déjà en centimes", () => {
    assert.equal(montantSioCents(1700), 1700);
    assert.equal(montantSioCents(4700), 4700);
  });

  test("un entier dont le CENTUPLE est un montant vendu était en euros", () => {
    assert.equal(montantSioCents(17), 1700);
    assert.equal(montantSioCents(47), 4700);
  });

  test("rien d'exploitable ne rend pas zéro, il rend null", () => {
    // Zéro se confondrait avec une vente à 0 EUR (le code GRATUIT).
    assert.equal(montantSioCents(""), null);
    assert.equal(montantSioCents(null), null);
    assert.equal(montantSioCents("gratuit"), null);
    assert.equal(montantSioCents(-5), null);
  });

  test("LE WEBHOOK L'UTILISE, et dit sa base", () => {
    const src = lire("app/api/systeme-io/webhook/route.ts");
    assert.match(src, /montantSioCents/);
    assert.match(src, /base: "ttc"/);
  });
});

// ── 5. QUI VERSE : NOUS, OU SYSTEME.IO ? ────────────────────────────
//
// Béné, 26 août : "ce qui est vendu dans systeme io est payé sur systeme
// io mais doit être tracké pour un dashboard affilié fiable pour
// l'affilié et pour moi, et ce qui passe sur nos nouvelles pages bah
// c'est ok on peut tout tracker proprement ?"
//
// C'est exactement le bon modèle, et le code ne le connaissait pas :
// `preparerLot` prenait TOUT ce qui était `approved`. Le premier lot
// aurait donc viré une deuxième fois les commissions que Systeme.io a
// déjà payées. Aucun lot n'avait encore tourné : c'est pris avant le
// premier virement, pas après.

describe("Qui verse cette commission", () => {
  const store = lire("lib/affiliate/versementStore.ts");

  test("LE LOT NE PREND QUE LES NÔTRES", () => {
    const bloc = store.slice(store.indexOf("export async function preparerLot"));
    assert.match(bloc.slice(0, 3000), /\.eq\("regle_par", "nous"\)/);
  });

  test("ET L'APPROBATION NON PLUS NE FAIT PAS MÛRIR LES LEURS", () => {
    // Sinon elles deviendraient `approved` et seraient indiscernables
    // des nôtres au premier coup d'oeil dans l'admin.
    const bloc = store.slice(store.indexOf("export async function approuverCommissionsMures"));
    assert.match(bloc.slice(0, 2000), /\.eq\("regle_par", "nous"\)/);
  });

  test("LE PAYEUR EST ÉCRIT À LA CRÉATION, jamais déduit du préfixe", () => {
    // On POURRAIT le deviner (`stripe:` = nous). Deviner la mécanique au
    // lieu de la porter est le défaut qui a produit la fausse alerte de
    // Véronique : le jour où un troisième encaisseur arrive, la
    // déduction se tait et l'argent part.
    const src = lire("lib/affiliate/attribution.ts");
    assert.match(src, /reglePar: "nous" \| "systeme_io";/);
    assert.match(src, /regle_par: input\.reglePar,/);
  });

  test("UN APPELANT MUET EST COMPTÉ COMME SYSTEME.IO, ET ÇA CRIE", () => {
    // Le repli est CONSERVATEUR : une ligne dont on ignore le payeur ne
    // partira PAS dans un lot. Elle s'affichera comme versée par eux, ce
    // qui se corrige d'un UPDATE ; l'inverse partirait en virement.
    const route = lire("app/api/affiliate/attribute-sale/route.ts");
    assert.match(route, /reglePar \?\? "systeme_io"/);
    assert.match(route, /EXCLUE des lots/);
  });

  test("LE WEBHOOK SYSTEME.IO DIT QUE C'EST EUX", () => {
    assert.match(lire("app/api/systeme-io/webhook/route.ts"), /reglePar: "systeme_io"/);
  });

  test("LA MIGRATION REMPLIT L'HISTORIQUE ET FIGE LE DÉFAUT", () => {
    const sql = lire("supabase/migrations/20260826_commission_regle_par.sql");
    // Le seul endroit où on déduit : ces lignes existent déjà, personne
    // ne peut plus leur demander d'où elles viennent.
    assert.match(sql, /sio_order_id like 'stripe:%'/);
    assert.match(sql, /set default 'systeme_io'/);
    assert.match(sql, /check \(regle_par in \('nous', 'systeme_io'\)\)/);
    assert.match(sql, /if not exists/);
    assert.match(sql, /notify pgrst, 'reload schema'/);
  });

  test("L'AFFILIÉ VOIT TOUT, ET SAIT QUI LE PAIE", () => {
    // Les deux populations vivent dans la MÊME table, et c'est voulu :
    // son tableau doit être complet. Mais une affiliée qui ne sait pas
    // lequel des deux systèmes regarde son argent, c'est un ticket de
    // support par mois et par personne.
    const page = lire("app/affiliate/revenus/page.tsx");
    assert.match(page, /regle_par/);
    assert.match(page, /paye_par_sio/);
    // Et le libellé existe dans les six langues.
    for (const f of ["fr", "en", "es", "it", "pt", "ar"]) {
      assert.match(lire(`app/affiliate/i18n/${f}.ts`), /paye_par_sio:/, `${f} sans libelle`);
    }
  });
});
