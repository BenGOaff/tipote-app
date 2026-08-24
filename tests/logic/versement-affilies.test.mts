// tests/logic/versement-affilies.test.mts
//
// PAYER LES AFFILIÉS : QUI, COMBIEN, PAR QUEL MOYEN.
//
// Béné, 25 août 2026 : "pour l'affiliation on doit proposer le choix aux
// affiliés : Paypal ou virement bancaire. Ils doivent pouvoir indiquer
// leur mail paypal OU leur rib pour un virement." Et la veille, sur la
// façon de payer : export SEPA et virement à la main.
//
// CE QUI N'EXISTAIT PAS : `affiliate_commissions` portait les statuts
// `pending / approved / paid` et une colonne `payout_id` depuis mai, mais
// AUCUN code ne faisait passer une commission d'un statut à l'autre, et
// aucune table de versement n'existait. Les statuts étaient décoratifs.
//
// C'est de l'argent qui SORT : une erreur ici ne se voit pas sur un
// écran, elle se voit sur le relevé de quelqu'un.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import {
  bicValide,
  emailPaypalValide,
  ibanValide,
  lireCoordonnees,
  manquesVersement,
  masquerEmail,
  masquerIban,
  normaliserBic,
  normaliserIban,
  peutEtrePayee,
  resoudreMethode,
} from "@/lib/affiliate/coordonnees";
import {
  DELAI_RETRACTATION_JOURS,
  MONTANT_MINIMUM_CENTS,
  commissionApprouvable,
  construireLot,
  periodeDe,
  type AffilieePayable,
  type CommissionAVerser,
} from "@/lib/affiliate/versement";
import {
  construirePaypalTsv,
  construireSepaXml,
  echapperXml,
  jourOuvre,
  montantSepa,
  nomSepa,
} from "@/lib/affiliate/sepa";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// Un IBAN de test qui passe vraiment le modulo 97.
const IBAN_FR = "FR1420041010050500013M02606";
const IBAN_BE = "BE68539007547034";

// ── LES COORDONNÉES ─────────────────────────────────────────────────

describe("Comment une affiliée veut être payée", () => {
  test("LA MÉTHODE EST UN CHOIX, JAMAIS UNE DÉDUCTION", () => {
    // Deviner "il a rempli un IBAN donc virement" marche jusqu'au jour
    // où quelqu'un remplit les deux. C'est alors le code qui décide où
    // part son argent.
    const deux = resoudreMethode({
      paypal_email: "marie@exemple.fr",
      iban_number: IBAN_FR,
    });
    assert.equal(deux.methode, null, "les deux remplis sans choix : on ne tranche pas");
    assert.equal(deux.explicite, false);

    const choisi = resoudreMethode({
      payout_method: "paypal",
      paypal_email: "marie@exemple.fr",
      iban_number: IBAN_FR,
    });
    assert.equal(choisi.methode, "paypal");
    assert.equal(choisi.explicite, true);
  });

  test("une ligne historique se lit, mais ne compte pas comme un choix", () => {
    // Les lignes d'avant le 25 août n'ont pas de `payout_method` : on
    // les lit pour ne pas perdre la saisie, et l'écran redemande.
    const h = resoudreMethode({ iban_number: IBAN_FR });
    assert.equal(h.methode, "virement");
    assert.equal(h.explicite, false);
  });

  test("LA CLÉ DE CONTRÔLE IBAN attrape la faute de frappe", () => {
    assert.ok(ibanValide(IBAN_FR));
    assert.ok(ibanValide(IBAN_BE));
    assert.ok(ibanValide("fr14 2004 1010 0505 0001 3M02 606"), "espaces et minuscules");
    // Deux chiffres inversés : forme plausible, virement rejeté trois
    // jours plus tard. C'est le cas fréquent, et c'est celui qu'on doit
    // attraper AVANT.
    assert.ok(!ibanValide("FR1420041010050500013M02660"));
    assert.ok(!ibanValide("FR0020041010050500013M02606"));
    assert.ok(!ibanValide("pas un iban"));
    assert.ok(!ibanValide(""));
    assert.ok(!ibanValide(null));
  });

  test("le calcul du modulo 97 ne perd pas en précision", () => {
    // L'entier complet fait jusqu'à 38 chiffres, bien au delà de ce
    // qu'un `number` porte. Un reste calculé sur un nombre tronqué
    // accepterait des IBAN faux et en refuserait des bons.
    const long = "MT84MALT011000012345MTLCAST001S"; // 31 caractères
    assert.equal(typeof ibanValide(long), "boolean");
    assert.ok(ibanValide("GB82WEST12345698765432"));
  });

  test("le BIC n'est pas exigé, mais un BIC faux est refusé", () => {
    // Depuis 2016 un virement SEPA se fait avec le seul IBAN. L'exiger
    // bloquerait des affiliées pour un champ que leur banque n'imprime
    // plus.
    const sansBic = lireCoordonnees({
      payout_method: "virement", iban_holder: "Marie Dupont", iban_number: IBAN_FR,
    });
    assert.deepEqual(manquesVersement(sansBic), []);
    assert.ok(peutEtrePayee(sansBic));

    const bicFaux = lireCoordonnees({
      payout_method: "virement", iban_holder: "Marie Dupont", iban_number: IBAN_FR, bic: "XX",
    });
    assert.deepEqual(manquesVersement(bicFaux), ["bic-invalide"]);
  });

  test("bicValide accepte les deux longueurs", () => {
    assert.ok(bicValide("BNPAFRPP"));
    assert.ok(bicValide("BNPAFRPPXXX"));
    assert.ok(!bicValide("BNPAFRPPX"));
    assert.ok(!bicValide("1234FRPP"));
  });

  test("LA MÉTHODE DÉCIDE DE CE QU'ON EXIGE", () => {
    // Réclamer un IBAN à quelqu'un qui a choisi PayPal, c'est un
    // formulaire qu'il n'aura jamais fini.
    const paypal = lireCoordonnees({ payout_method: "paypal", paypal_email: "marie@exemple.fr" });
    assert.deepEqual(manquesVersement(paypal), []);

    const paypalVide = lireCoordonnees({ payout_method: "paypal" });
    assert.deepEqual(manquesVersement(paypalVide), ["paypal-email"]);

    const virementVide = lireCoordonnees({ payout_method: "virement" });
    assert.deepEqual(manquesVersement(virementVide), ["titulaire", "iban"]);
  });

  test("sans méthode, un seul manque : la question à poser", () => {
    // Lister quatre champs à quelqu'un qui n'a pas encore choisi, c'est
    // lui demander de deviner lesquels le concernent.
    assert.deepEqual(manquesVersement(lireCoordonnees({})), ["methode"]);
  });

  test("emailPaypalValide refuse ce qui ne peut pas recevoir d'argent", () => {
    assert.ok(emailPaypalValide("marie@exemple.fr"));
    assert.ok(!emailPaypalValide("marie@exemple"));
    assert.ok(!emailPaypalValide("marie"));
    assert.ok(!emailPaypalValide(""));
  });

  test("UN IBAN NE RESSORT JAMAIS EN CLAIR, PAS MÊME VERS SA PROPRIÉTAIRE", () => {
    // Un écran se photographie, se partage, se laisse ouvert. Elle a
    // besoin de reconnaître le sien, pas de le relire.
    const masque = masquerIban(IBAN_FR);
    assert.ok(masque);
    assert.ok(masque!.startsWith("FR14"));
    assert.ok(masque!.endsWith("2606"));
    assert.ok(!masque!.includes("0041010050500013M0"));
    assert.equal(masquerEmail("marie@exemple.fr"), "mar••@exemple.fr");
  });

  test("l'IBAN est normalisé dès la lecture", () => {
    assert.equal(normaliserIban(" fr14-2004 1010 0505 0001 3m02 606 "), IBAN_FR);
  });

  test("NORMALISER N'EST PAS VALIDER : une saisie fausse ne DISPARAÎT pas", () => {
    // Premier jet : `normaliserBic` rendait null dès que la longueur
    // n'etait pas 8 ou 11, donc un BIC tape de travers etait vide en
    // silence et `manquesVersement` n'avait plus rien a signaler.
    // L'affiliee voyait sa saisie disparaitre sans un mot.
    assert.equal(normaliserBic("bnpa frpp"), "BNPAFRPP");
    assert.equal(normaliserBic("xx"), "XX", "on garde la saisie, meme fausse");
    assert.ok(!bicValide("XX"), "et c'est la validation qui la refuse");
    // Idem pour un IBAN trop court : il se voit, donc il se corrige.
    assert.equal(normaliserIban("FR14"), "FR14");
    assert.ok(!ibanValide("FR14"));
    const trop_court = lireCoordonnees({
      payout_method: "virement", iban_holder: "Marie", iban_number: "FR14",
    });
    assert.deepEqual(manquesVersement(trop_court), ["iban-invalide"]);
  });
});

// ── APPROUVER ───────────────────────────────────────────────────────

describe("Approuver n'est pas payer", () => {
  const base: CommissionAVerser = {
    id: "c1", sa: "sa001", status: "pending",
    commission_cents: 3290, sale_at: "2026-07-01T10:00:00Z",
  };
  const maintenant = Date.parse("2026-08-25T10:00:00Z");

  test("une vente d'il y a deux mois est acquise", () => {
    assert.ok(commissionApprouvable(base, maintenant));
  });

  test("une vente d'hier ne l'est PAS : le délai de rétractation court", () => {
    // Une commission déjà virée ne se reprend pas.
    const hier = { ...base, sale_at: "2026-08-24T10:00:00Z" };
    assert.ok(!commissionApprouvable(hier, maintenant));
  });

  test("le délai est un PARAMÈTRE, pas une constante enfouie", () => {
    const hier = { ...base, sale_at: "2026-08-24T10:00:00Z" };
    assert.ok(commissionApprouvable(hier, maintenant, 0));
    assert.equal(DELAI_RETRACTATION_JOURS, 21);
  });

  test("une commission annulée ne repasse JAMAIS approuvable", () => {
    // C'est la seule sortie définitive : la vente a été remboursée.
    assert.ok(!commissionApprouvable({ ...base, cancelled_at: "2026-07-05T00:00:00Z" }, maintenant));
  });

  test("ce qui est déjà approuvé ou payé n'est pas réapprouvé", () => {
    for (const status of ["approved", "paid", "cancelled", "rejected"]) {
      assert.ok(!commissionApprouvable({ ...base, status }, maintenant), status);
    }
  });

  test("un montant nul ou négatif n'est jamais approuvé", () => {
    assert.ok(!commissionApprouvable({ ...base, commission_cents: 0 }, maintenant));
    assert.ok(!commissionApprouvable({ ...base, commission_cents: -100 }, maintenant));
  });

  test("une date de vente illisible ne débloque rien", () => {
    assert.ok(!commissionApprouvable({ ...base, sale_at: "pas une date" }, maintenant));
  });
});

// ── LE LOT ──────────────────────────────────────────────────────────

function affiliee(sa: string, sur: Partial<AffilieePayable> = {}): AffilieePayable {
  const coordonnees = lireCoordonnees({
    payout_method: "virement", iban_holder: "Marie Dupont", iban_number: IBAN_FR,
  });
  return {
    sa, email: `${sa}@exemple.fr`, displayName: "Marie Dupont",
    coordonnees, payable: peutEtrePayee(coordonnees), ...sur,
  };
}

function commission(sa: string, id: string, cents: number, sur: Partial<CommissionAVerser> = {}): CommissionAVerser {
  return { id, sa, status: "approved", commission_cents: cents, sale_at: "2026-07-01T10:00:00Z", ...sur };
}

describe("Le lot du mois", () => {
  test("UNE LIGNE PAR AFFILIÉE, pas une par commission", () => {
    // On fait UN virement à quelqu'un, pas douze.
    const lot = construireLot(
      [commission("sa1", "c1", 3290), commission("sa1", "c2", 1200), commission("sa2", "c3", 4700)],
      [affiliee("sa1"), affiliee("sa2")],
    );
    assert.equal(lot.lignes.length, 2);
    const sa1 = lot.lignes.find((l) => l.sa === "sa1");
    assert.equal(sa1?.montantCents, 4490);
    assert.deepEqual(sa1?.commissionIds.sort(), ["c1", "c2"]);
    assert.equal(lot.totalCents, 9190);
  });

  test("le plus gros d'abord : c'est celui dont une erreur coûte le plus", () => {
    const lot = construireLot(
      [commission("sa1", "c1", 2100), commission("sa2", "c2", 9900)],
      [affiliee("sa1"), affiliee("sa2")],
    );
    assert.deepEqual(lot.lignes.map((l) => l.sa), ["sa2", "sa1"]);
  });

  test("SEULES LES APPROUVÉES ENTRENT", () => {
    const lot = construireLot(
      [
        commission("sa1", "c1", 3000, { status: "pending" }),
        commission("sa1", "c2", 3000, { status: "paid" }),
        commission("sa1", "c3", 3000, { status: "cancelled" }),
        commission("sa1", "c4", 3000),
      ],
      [affiliee("sa1")],
    );
    assert.equal(lot.totalCents, 3000);
    assert.deepEqual(lot.lignes[0].commissionIds, ["c4"]);
  });

  test("UNE COMMISSION DÉJÀ PRISE PAR UN LOT NE REPART PAS", () => {
    // Sans ce test, un lot construit deux fois paierait deux fois.
    const lot = construireLot(
      [commission("sa1", "c1", 3000, { payout_id: "lot-precedent" }), commission("sa1", "c2", 3000)],
      [affiliee("sa1")],
    );
    assert.equal(lot.totalCents, 3000);
  });

  test("SOUS LE MINIMUM : écarté, mais l'argent reste acquis", () => {
    // Un virement de 12 € coûte plus cher en temps qu'il ne rapporte.
    // Ce n'est pas de l'argent perdu : il attend le lot suivant.
    const lot = construireLot([commission("sa1", "c1", 1200)], [affiliee("sa1")]);
    assert.equal(lot.lignes.length, 0);
    assert.deepEqual(lot.ecartees, [
      { sa: "sa1", raison: "sous-le-minimum", montantCents: 1200, commissionIds: ["c1"] },
    ]);
    assert.equal(MONTANT_MINIMUM_CENTS, 2000);
  });

  test("SANS COORDONNÉES : ÉCARTÉE ET DITE, jamais avalée en silence", () => {
    // Elle a gagné cet argent : quelqu'un doit lui écrire. Un échec
    // silencieux coûte plus cher que le problème (règle du 3 août).
    const sansRien = affiliee("sa1", {
      coordonnees: lireCoordonnees({}),
      payable: false,
    });
    const lot = construireLot([commission("sa1", "c1", 9900)], [sansRien]);
    assert.equal(lot.lignes.length, 0);
    assert.equal(lot.ecartees[0].raison, "coordonnees");
    assert.equal(lot.ecartees[0].montantCents, 9900);
  });

  test("une affiliée inconnue ne disparaît pas non plus", () => {
    const lot = construireLot([commission("sa-fantome", "c1", 9900)], []);
    assert.equal(lot.ecartees[0].raison, "affiliee-inconnue");
  });

  test("LES COORDONNÉES SONT RECOPIÉES DANS LA LIGNE, DONC FIGÉES", () => {
    // Si elle change d'IBAN le lendemain, le fichier déjà déposé à la
    // banque ne doit pas changer. C'est la règle de la facture émise,
    // transposée à l'argent qui sort.
    const lot = construireLot([commission("sa1", "c1", 9900)], [affiliee("sa1")]);
    assert.equal(lot.lignes[0].iban, IBAN_FR);
    assert.equal(lot.lignes[0].methode, "virement");
    assert.equal(lot.lignes[0].paypalEmail, null, "pas d'email PayPal sur une ligne virement");
  });

  test("un IBAN n'est pas recopié dans une ligne PayPal", () => {
    // Une donnée bancaire promenée pour rien est une donnée bancaire de
    // trop.
    const coordonnees = lireCoordonnees({ payout_method: "paypal", paypal_email: "m@exemple.fr" });
    const lot = construireLot(
      [commission("sa1", "c1", 9900)],
      [affiliee("sa1", { coordonnees, payable: true })],
    );
    assert.equal(lot.lignes[0].iban, null);
    assert.equal(lot.lignes[0].paypalEmail, "m@exemple.fr");
  });

  test("les totaux par méthode : deux fichiers à produire", () => {
    const parPaypal = lireCoordonnees({ payout_method: "paypal", paypal_email: "m@exemple.fr" });
    const lot = construireLot(
      [commission("sa1", "c1", 5000), commission("sa2", "c2", 3000)],
      [affiliee("sa1"), affiliee("sa2", { coordonnees: parPaypal, payable: true })],
    );
    assert.equal(lot.totalParMethode.virement, 5000);
    assert.equal(lot.totalParMethode.paypal, 3000);
    assert.equal(lot.totalCents, 8000);
  });

  test("la période se lit d'une date", () => {
    assert.equal(periodeDe("2026-08-25T10:00:00Z"), "2026-08");
    assert.equal(periodeDe("2027-01-02T10:00:00Z"), "2027-01");
  });
});

// ── LE FICHIER SEPA ─────────────────────────────────────────────────

describe("Le fichier que la banque accepte", () => {
  const options = {
    lotId: "LOT-2026-08",
    periode: "2026-08",
    debiteur: { nom: "ETHILIFE", iban: IBAN_FR, bic: "BNPAFRPP" },
    maintenant: new Date("2026-09-10T08:00:00Z"), // un jeudi
  };

  function lotDeuxVirements() {
    const paypal = lireCoordonnees({ payout_method: "paypal", paypal_email: "bob@exemple.fr" });
    return construireLot(
      [commission("sa1", "c1", 3290), commission("sa2", "c2", 4700), commission("sa3", "c3", 5000)],
      [
        affiliee("sa1"),
        affiliee("sa2", {
          coordonnees: lireCoordonnees({
            payout_method: "virement", iban_holder: "Éric Müller", iban_number: IBAN_BE,
          }),
          payable: true,
          displayName: "Éric Müller",
        }),
        affiliee("sa3", { coordonnees: paypal, payable: true, displayName: "Bob" }),
      ],
    );
  }

  test("LA SOMME DES LIGNES VAUT LE TOTAL DE CONTRÔLE", () => {
    // C'est le premier contrôle que fait la banque, et le fichier est
    // refusé au centime près.
    const xml = construireSepaXml(lotDeuxVirements().lignes, options)!;
    assert.ok(xml);
    const total = [...xml.matchAll(/<InstdAmt Ccy="EUR">([\d.]+)<\/InstdAmt>/g)]
      .reduce((s, m) => s + Math.round(Number(m[1]) * 100), 0);
    const controle = Math.round(Number(/<CtrlSum>([\d.]+)<\/CtrlSum>/.exec(xml)![1]) * 100);
    assert.equal(total, controle);
    assert.equal(total, 7990, "seulement les VIREMENTS, pas la ligne PayPal");
  });

  test("le nombre de transactions correspond", () => {
    const xml = construireSepaXml(lotDeuxVirements().lignes, options)!;
    const declares = Number(/<NbOfTxs>(\d+)<\/NbOfTxs>/.exec(xml)![1]);
    const reels = [...xml.matchAll(/<CdtTrfTxInf>/g)].length;
    assert.equal(declares, reels);
    assert.equal(reels, 2);
  });

  test("LES MONTANTS ONT DEUX DÉCIMALES ET UN POINT", () => {
    assert.equal(montantSepa(3290), "32.90");
    assert.equal(montantSepa(100000), "1000.00");
    assert.equal(montantSepa(1), "0.01");
    assert.ok(!montantSepa(100000).includes(","), "jamais de virgule ni de séparateur");
  });

  test("UN NOM AVEC UN & NE CASSE PAS LE FICHIER", () => {
    // Le nom vient d'un formulaire. Un `&` non échappé rend le XML
    // entier invalide, donc le lot entier impayable.
    assert.equal(echapperXml("Dupont & Fils <SARL>"), "Dupont &amp; Fils &lt;SARL&gt;");
    const lot = construireLot(
      [commission("sa1", "c1", 9900)],
      [affiliee("sa1", { displayName: "Dupont & Fils" })],
    );
    const xml = construireSepaXml(lot.lignes, options)!;
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), "aucune esperluette nue");
  });

  test("les accents sont TRANSLITTÉRÉS, pas supprimés", () => {
    // SEPA n'admet qu'un jeu latin restreint, mais "Bénédicte" doit
    // rester lisible sur le relevé, pas devenir "Bndicte".
    assert.equal(nomSepa("Bénédicte Lagardette"), "Benedicte Lagardette");
    assert.equal(nomSepa("Éric Müller"), "Eric Muller");
    assert.equal(nomSepa(""), "AFFILIE", "jamais un nom vide dans le fichier");
    assert.ok(!/[^\x20-\x7E]/.test(nomSepa("Zoé 🎉 Renard")));
  });

  test("LA DATE D'EXÉCUTION EST UN JOUR OUVRÉ", () => {
    // Un fichier daté d'un samedi est rejeté, ou décalé sans prévenir.
    assert.equal(jourOuvre(new Date("2026-09-12T10:00:00Z")), "2026-09-14", "samedi -> lundi");
    assert.equal(jourOuvre(new Date("2026-09-13T10:00:00Z")), "2026-09-14", "dimanche -> lundi");
    assert.equal(jourOuvre(new Date("2026-09-10T10:00:00Z")), "2026-09-10", "jeudi : inchangé");
  });

  test("L'IDENTIFIANT DU FICHIER EST CELUI DU LOT, donc non rejouable", () => {
    // La banque déduplique sur `MsgId` : rejouer le même fichier fait
    // rejeter le second. C'est une protection, pas un défaut.
    const xml = construireSepaXml(lotDeuxVirements().lignes, options)!;
    assert.match(xml, /<MsgId>TIPOTE-LOT-2026-08<\/MsgId>/);
    assert.match(xml, /<PmtInfId>TIPOTE-LOT-2026-08<\/PmtInfId>/);
  });

  test("aucun virement : pas de fichier, et ce n'est PAS une erreur", () => {
    // Un mois où tout le monde a choisi PayPal.
    const paypal = lireCoordonnees({ payout_method: "paypal", paypal_email: "b@exemple.fr" });
    const lot = construireLot(
      [commission("sa1", "c1", 9900)],
      [affiliee("sa1", { coordonnees: paypal, payable: true })],
    );
    assert.equal(construireSepaXml(lot.lignes, options), null);
  });

  test("l'IBAN du créditeur est bien celui de la ligne figée", () => {
    const xml = construireSepaXml(lotDeuxVirements().lignes, options)!;
    assert.ok(xml.includes(`<IBAN>${IBAN_BE}</IBAN>`));
    assert.ok(xml.includes(`<IBAN>${IBAN_FR}</IBAN>`), "et celui du débiteur");
  });
});

describe("La liste PayPal", () => {
  test("SÉPARÉE PAR DES TABULATIONS, pas par des virgules", () => {
    // Un nom ou une note contenant une virgule décalerait toutes les
    // colonnes, et un montant se retrouverait dans la colonne devise.
    const paypal = lireCoordonnees({ payout_method: "paypal", paypal_email: "bob@exemple.fr" });
    const lot = construireLot(
      [commission("sa1", "c1", 3290)],
      [affiliee("sa1", { coordonnees: paypal, payable: true, displayName: "Bob, le grand" })],
    );
    const tsv = construirePaypalTsv(lot.lignes, "2026-08", "LOT-2026-08")!;
    const colonnes = tsv.split("\n")[0].split("\t");
    assert.equal(colonnes.length, 5);
    assert.equal(colonnes[0], "bob@exemple.fr");
    assert.equal(colonnes[1], "32.90");
    assert.equal(colonnes[2], "EUR");
  });

  test("aucune ligne PayPal : pas de fichier", () => {
    const lot = construireLot([commission("sa1", "c1", 9900)], [affiliee("sa1")]);
    assert.equal(construirePaypalTsv(lot.lignes, "2026-08", "LOT"), null);
  });
});

// ── LES RÈGLES QUI NE SE VOIENT PAS ─────────────────────────────────

describe("Les règles qui ne se voient pas dans un écran", () => {
  test("les décisions vivent dans des modules PURS", () => {
    // Aucun de ces trois fichiers ne doit importer Supabase : sinon
    // aucun test ne peut les importer, et c'est LITTÉRALEMENT là que les
    // bugs s'installent (leçon du verrou des webhooks, 24 août).
    for (const f of [
      "lib/affiliate/coordonnees.ts",
      "lib/affiliate/versement.ts",
      "lib/affiliate/sepa.ts",
    ]) {
      assert.ok(!lire(f).includes("supabaseAdmin"), `${f} importe supabaseAdmin`);
    }
  });

  test("`maintenant` est un paramètre partout où une date décide", () => {
    // Un test qui lit l'horloge clignote, et un test qui clignote est
    // pire que pas de test.
    assert.ok(!/Date\.now\(\)/.test(lire("lib/affiliate/versement.ts")));
    assert.ok(!/new Date\(\)\s*[;,)]/.test(lire("lib/affiliate/sepa.ts")));
  });
});

// ── LE CYCLE, ET CE QU'IL NE DOIT JAMAIS FAIRE ──────────────────────

describe("Le cycle de versement, vu de la structure", () => {
  test("AUCUN ARGENT NE PART D'UN ÉCRAN", () => {
    // Béné dépose le fichier dans sa banque ; c'est sa banque qui
    // exécute. Un bouton qui virerait vraiment de l'argent depuis un
    // écran d'admin est exactement ce qu'on ne construit pas.
    const route = lire("app/api/affiliate/admin/versements/route.ts");
    assert.ok(!/payouts\/|\/v1\/payments\/payouts|payout_batch/i.test(route),
      "aucun appel a une API de versement");
    assert.match(route, /Aucun argent ne\s*\n?\/\/ part d'ici|Aucun argent ne part/i);
  });

  test("L'IBAN DU DÉBITEUR VIENT DE L'ENVIRONNEMENT, jamais du dépôt", () => {
    // C'est un IBAN d'entreprise : il n'a rien à faire dans Git.
    const route = lire("app/api/affiliate/admin/versements/route.ts");
    assert.match(route, /process\.env\.SEPA_DEBTOR_IBAN/);
    assert.ok(!/FR\d{2}[0-9A-Z]{10,}/.test(route), "aucun IBAN ecrit en dur");
  });

  test("SANS IBAN DÉBITEUR, on refuse en le DISANT", () => {
    // Un fichier vide se dépose à la banque et se fait refuser sans
    // qu'on sache pourquoi.
    const route = lire("app/api/affiliate/admin/versements/route.ts");
    assert.match(route, /sepa_non_configure/);
  });

  test("LA SESSION FAIT FOI, jamais le corps de la requête", () => {
    // Si le `sa` venait du JSON reçu, n'importe qui pourrait rediriger
    // les commissions de n'importe qui vers son propre compte.
    const route = lire("app/api/affiliate/coordonnees/route.ts");
    assert.match(route, /session\.sa/);
    assert.ok(!/body\.sa\b/.test(route), "le `sa` ne vient JAMAIS du corps");
  });

  test("L'IBAN NE SORT JAMAIS EN CLAIR D'UNE ROUTE", () => {
    const route = lire("app/api/affiliate/coordonnees/route.ts");
    // La route renvoie ce que le store rend, et le store ne rend qu'un
    // masque (`CoordonneesAffichables.ibanMasque`).
    assert.ok(!/iban_chiffre|dechiffrerIban/.test(route));
    const store = lire("lib/affiliate/versementStore.ts");
    assert.match(store, /ibanMasque: l\.iban_masque/);
  });

  test("le chiffrement de l'IBAN a lieu dans le store, pas ailleurs", () => {
    const store = lire("lib/affiliate/versementStore.ts");
    assert.match(store, /encryptField\(iban, dek\)/);
    // Et la clé de l'affiliée est RÉUTILISÉE : en regénérer une à chaque
    // écriture rendrait l'ancien chiffré illisible.
    assert.match(store, /if \(!dekEnveloppe\) dekEnveloppe = wrapDEK\(generateDEK\(\)\)/);
  });

  test("ON CRÉE LE LOT AVANT DE MARQUER LES COMMISSIONS", () => {
    // L'inverse laisserait des commissions marquées `paid` pointant vers
    // un lot qui n'existe pas : de l'argent qu'on croit versé, sans
    // trace de virement.
    const store = lire("lib/affiliate/versementStore.ts");
    const creation = store.indexOf(".from(TABLE_LOTS)\n      .insert(");
    const marquage = store.indexOf('status: "paid"');
    assert.ok(creation > 0 && marquage > 0);
    assert.ok(creation < marquage, "le lot doit etre cree en premier");
  });

  test("un lot par mois : l'unicité est une PROTECTION", () => {
    // Construire deux fois le lot d'août paierait deux fois.
    const sql = lire("supabase/migrations/20260825_affiliate_payouts.sql");
    assert.match(sql, /periode\s+text not null unique/);
    assert.match(lire("lib/affiliate/versementStore.ts"), /lot_existe_deja/);
  });

  test("L'IBAN EN CLAIR N'EST PLUS STOCKÉ", () => {
    const sql = lire("supabase/migrations/20260825_affiliate_payouts.sql");
    assert.match(sql, /iban_chiffre/);
    assert.match(sql, /DEPRECIE/, "l'ancienne colonne est marquee, pas supprimee");
    // La supprimer ferait echouer toute route deployee en retard.
    assert.ok(!/drop column/i.test(sql));
  });

  test("l'écran affilié affiche les DEUX méthodes, dans les 6 langues", () => {
    for (const l of ["fr", "en", "es", "it", "pt", "ar"]) {
      const src = lire(`app/affiliate/i18n/${l}.ts`);
      for (const c of ["method_paypal", "method_virement", "err_iban_invalide", "iban_stored_note"]) {
        assert.match(src, new RegExp(`${c}:`), `${l} : ${c} manquant`);
      }
    }
  });

  test("la page Paiement ne PROMET plus ce qu'elle ne fait pas", () => {
    // Elle avait été débranchée le 8 juin parce qu'elle faisait croire
    // que la configuration était chez nous ("arrête d'inventer n'importe
    // quoi"). Elle revient parce que le cycle existe.
    const page = lire("app/affiliate/paiement/page.tsx");
    assert.match(page, /CoordonneesVersement/);
    // Et elle continue de dire ce qui reste chez Systeme.io.
    assert.match(page, /sio_config_title/);
  });
});
