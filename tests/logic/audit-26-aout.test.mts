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

// ── 6. LE PROGRAMME SE COMPORTE COMME SYSTEME.IO ────────────────────
//
// Béné, 26 août, en listant les règles de Systeme.io : "Je dois être
// sûre que tu as bien tout compris et pris en compte avant d'envoyer le
// moindre code."
//
// Chacune de ses sept règles est un comportement que Systeme.io donnait
// gratuitement depuis des années. En reprenant la vente chez nous,
// chacune doit être réécrite explicitement, et aucune ne se signale
// toute seule quand elle manque : rien ne casse, l'argent tombe juste
// au mauvais endroit. Ce bloc les fige une par une.

import { ATTRIBUTION_A_VIE, planchierRattachement } from "@/lib/affiliate/fenetreAttribution";
import { DELAI_RETRACTATION_JOURS, construireLot } from "@/lib/affiliate/versement";

describe("Les regles du programme, comme chez Systeme.io", () => {
  test("LA COMMISSION EST VERSABLE À J+30 DU PAIEMENT", () => {
    // C'était 21 jours, par un raisonnement sur la rétractation légale.
    // Le raisonnement se tenait, mais ses affiliés connaissent J+30 :
    // un délai maison qui diffère du délai annoncé se remarque au
    // premier virement.
    assert.equal(DELAI_RETRACTATION_JOURS, 30);
  });

  test("ET CE QUE L'ÉCRAN ANNONCE DIT LE MÊME NOMBRE", () => {
    // Deux endroits qui disent la même chose sans passer par le même
    // code finissent toujours par se contredire. Ici le texte est
    // traduit à la main dans six langues : le test est le seul lien.
    for (const f of ["fr", "en", "es", "it", "pt", "ar"]) {
      const src = lire(`app/affiliate/i18n/${f}.ts`);
      const ligne = src.split("\n").find((l) => l.includes("minimum_note"));
      assert.ok(ligne, `${f} : la note de versement a disparu`);
      assert.ok(
        ligne.includes(String(DELAI_RETRACTATION_JOURS)),
        `${f} annonce un delai different de ${DELAI_RETRACTATION_JOURS} jours`,
      );
    }
  });

  test("LE RATTACHEMENT EST À VIE", () => {
    // "S'il s'inscrit en free sur son lien : il reste son affilié à
    // vie." La fenêtre était de 90 jours : un inscrit de janvier qui
    // passe payant en juin ne payait plus personne.
    assert.equal(ATTRIBUTION_A_VIE, true);
    // Pas de plancher de date : la recherche remonte aussi loin qu'il
    // faut. `maintenant` est un parametre, sinon le test clignote.
    assert.equal(planchierRattachement(Date.parse("2027-01-01")), null);
    // Et la decision vit dans un module PUR : `attribution.ts` importe
    // `supabaseAdmin`, donc aucun test ne peut l'importer. C'est
    // exactement le piege qui a cache le verrou des webhooks.
    // On regarde les IMPORTS, pas la prose : l'en-tete du fichier
    // EXPLIQUE justement pourquoi il ne doit pas tirer `supabaseAdmin`,
    // et un test qui rougit sur un commentaire finit desactive.
    assert.ok(
      !/^import .*supabaseAdmin/m.test(lire("lib/affiliate/fenetreAttribution.ts")),
      "le module de decision tire de nouveau la base",
    );
  });

  test("LE PREMIER RATTACHEMENT GAGNE, pas le dernier", () => {
    // Celui qui a AMENÉ la personne la garde. Trier du plus récent
    // donnerait le contact au dernier affilié dont il a croisé un lien,
    // ce qui viderait de son sens la promesse "à vie".
    const src = lire("lib/affiliate/attribution.ts");
    const bloc = src.slice(src.indexOf("async function findRecentConversion"));
    assert.match(bloc.slice(0, 900), /\.order\("created_at", \{ ascending: true \}\)/);
  });

  test("UNE INSCRIPTION GRATUITE RATTACHE VRAIMENT", () => {
    // La règle ne marchait QUE via Systeme.io : notre propre
    // inscription ne lisait ni le cookie ni le `?ref=`.
    const route = lire("app/api/affiliate/rattacher/route.ts");
    assert.match(route, /affiliate_conversions/);
    assert.match(route, /x-affiliate-secret/);
    // Un affilié exclu ne rattache personne : c'est à vie, donc ce
    // n'est pas l'endroit où être permissif.
    assert.match(route, /status !== "active"/);
    // Et on ne se rattache pas à soi même, alias compris.
    assert.match(route, /memePersonne/);
    // Le PREMIER rattachement gagne : on n'en écrit pas un deuxième.
    assert.match(route, /rattache_a_un_autre/);
  });

  test("UNE COMMISSION EN DEVISE ÉTRANGÈRE NE PART PAS EN EUROS", () => {
    // Le fichier SEPA porte `Ccy="EUR"`. Trois plans Tiquiz en dollars
    // existent chez Systeme.io depuis avril : le cas n'est pas
    // théorique. On n'invente pas de taux de change, on écarte en le
    // disant.
    const lot = construireLot(
      [
        { id: "c1", sa: "sa1", status: "approved", commission_cents: 5000, currency: "USD", sale_at: "2026-01-01", payout_id: null },
        { id: "c2", sa: "sa1", status: "approved", commission_cents: 4000, currency: "EUR", sale_at: "2026-01-01", payout_id: null },
      ],
      [
        {
          sa: "sa1",
          email: "a@b.fr",
          displayName: null,
          coordonnees: { methode: "paypal", paypalEmail: "a@b.fr", titulaire: null, iban: null, bic: null },
          payable: true,
          profilComplet: true,
        },
      ],
    );
    // Seule la ligne en euros est payée.
    assert.equal(lot.lignes.length, 1);
    assert.equal(lot.lignes[0].montantCents, 4000);
    // Et la dollar est DITE, pas avalée.
    const devise = lot.ecartees.find((e) => e.raison === "devise");
    assert.ok(devise, "la commission en dollars a disparu en silence");
    assert.equal(devise.montantCents, 5000);
  });

  test("LA FILE SE VIDE PAR LE PLUS ANCIEN", () => {
    // La commission est récurrente : une ligne par abonné et par mois.
    // Le jour où la file dépasse la limite, une requête sans tri laisse
    // Postgres choisir, et ce sont toujours les mêmes qui restent
    // dehors, sans que rien ne le signale.
    const store = lire("lib/affiliate/versementStore.ts");
    const occurrences = store.match(/\.order\("sale_at", \{ ascending: true \}\)/g) ?? [];
    assert.equal(occurrences.length, 2, "une des deux files n'est plus triee");
  });
});
