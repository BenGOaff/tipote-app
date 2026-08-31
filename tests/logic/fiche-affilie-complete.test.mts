// tests/logic/fiche-affilie-complete.test.mts
//
// LA FICHE D'UN AFFILIÉ DOIT TOUT DIRE (31 août 2026).
//
// Béné : "je clique sur l'affilié, je vois combien de comptes gratuits
// il a fait créer, combien il a de clients payants, quel est son palier
// de commission et / ou sa réduction sur l'outil, les factures passées,
// en cours et à venir, son mode de paiement... je veux TOUT parce que
// je ne peux le voir qu'ici."
//
// Elle a raison sur le "je ne peux le voir qu'ici" : le registre vit
// dans ce dépôt et nulle part ailleurs.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { construireRecompense, construireVersement } from "@/lib/affiliate/ficheComplete";
import { construireFiche } from "@/lib/affiliate/ficheAffilie";

const ROUTE = readFileSync("app/api/partner/affilies/[sa]/route.ts", "utf8");

const MAINTENANT = Date.parse("2026-08-31T12:00:00Z");
const ANCIEN = "2026-06-01T10:00:00Z";
const RECENT = "2026-08-29T10:00:00Z";

// --- la récompense ----------------------------------------------------

test("un accord negocie passe DEVANT le barreme", () => {
  // `affiliate_rate_overrides` existait depuis le 19 aout et n'etait
  // affichee nulle part : un partenariat a 60 % s'affichait a 40 %.
  const r = construireRecompense({
    choix: "commissions",
    tauxStockePct: 45,
    tauxNegociePct: 60,
    remiseStockePct: 0,
    filleulsPayants: 3,
  });
  assert.equal(r.tauxPct, 60);
  assert.equal(r.tauxNegocie, true);
});

test("le taux affiche est celui qui sera VERSE, pas un bareme recalcule", () => {
  // `attributeSale` pose `recompense_commission_pct` sur l'AFFILIE.
  // Reafficher le bareme donnerait un autre chiffre, et c'est celui de
  // l'ecran que Bene croirait.
  const r = construireRecompense({
    choix: "commissions",
    tauxStockePct: 50,
    tauxNegociePct: null,
    remiseStockePct: 0,
    filleulsPayants: 1, // le bareme dirait 45 %
  });
  assert.equal(r.tauxPct, 50);
  assert.equal(r.tauxNegocie, false);
});

test("sans rien de stocke, on retombe sur le bareme", () => {
  const r = construireRecompense({
    choix: "commissions",
    tauxStockePct: null,
    tauxNegociePct: null,
    remiseStockePct: 0,
    filleulsPayants: 0,
  });
  assert.equal(r.tauxPct, 40, "40 % est le taux de depart");
});

test("qui a choisi la remise ne touche AUCUNE commission", () => {
  // Les deux ne se cumulent pas (regle de Bene). Afficher un taux a
  // cote d'une remise ferait croire l'inverse.
  const r = construireRecompense({
    choix: "abonnement",
    tauxStockePct: null,
    tauxNegociePct: null,
    remiseStockePct: 20,
    filleulsPayants: 20,
  });
  assert.equal(r.choix, "abonnement");
  assert.equal(r.remisePct, 20);
});

test("la marche suivante depend du CHOIX, elle ne se devine pas", () => {
  // Annoncer une marche de commission a quelqu'un qui a pris la remise
  // serait faux dans les deux sens.
  const com = construireRecompense({
    choix: "commissions", tauxStockePct: null, tauxNegociePct: null, remiseStockePct: 0, filleulsPayants: 3,
  });
  const abo = construireRecompense({
    choix: "abonnement", tauxStockePct: null, tauxNegociePct: null, remiseStockePct: 0, filleulsPayants: 3,
  });
  assert.notEqual(com.prochaineMarcheValeur, abo.prochaineMarcheValeur);
});

// --- le versement -----------------------------------------------------

test("l'IBAN ne sort JAMAIS, seul le masque circule", () => {
  const v = construireVersement({
    methode: "virement",
    paypalEmail: null,
    ibanMasque: "FR14••••2606",
    titulaire: "Nina",
    mandatAccepteLe: "2026-08-26T09:00:00Z",
    profilFiscalComplet: true,
  });
  assert.equal(v.ibanMasque, "FR14••••2606");
  // La route ne doit nommer ni le chiffre ni la cle. On regarde le
  // CODE, pas les commentaires : l'en-tete les nomme expres, pour dire
  // qu'ils ne sortent pas, et retirer cette explication ferait perdre
  // le seul endroit qui le raconte.
  const codeSeul = ROUTE.split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  assert.doesNotMatch(codeSeul, /iban_chiffre/);
  assert.doesNotMatch(codeSeul, /pii_dek/);
  // Et surtout : aucun spread de la ligne `affiliates`, qui les
  // ferait sortir tous les deux d'un coup sur un `select("*")`.
  assert.doesNotMatch(codeSeul, /\.\.\.affRes\.data/);
});

test("la methode est un CHOIX, devinee seulement sur les lignes historiques", () => {
  const choisi = construireVersement({
    methode: "paypal", paypalEmail: "nina@ex.fr", ibanMasque: "FR14••••2606",
    titulaire: null, mandatAccepteLe: "2026-08-26", profilFiscalComplet: true,
  });
  assert.equal(choisi.methode, "paypal");
  assert.equal(choisi.explicite, true);

  const devine = construireVersement({
    methode: null, paypalEmail: "nina@ex.fr", ibanMasque: null,
    titulaire: null, mandatAccepteLe: "2026-08-26", profilFiscalComplet: true,
  });
  assert.equal(devine.methode, "paypal");
  assert.equal(devine.explicite, false, "l'ecran doit redemander au lieu de faire croire qu'il a tranche");

  // Les DEUX remplis sans choix : on ne devine pas, ce serait le code
  // qui deciderait ou part son argent.
  const ambigu = construireVersement({
    methode: null, paypalEmail: "nina@ex.fr", ibanMasque: "FR14••••2606",
    titulaire: null, mandatAccepteLe: "2026-08-26", profilFiscalComplet: true,
  });
  assert.equal(ambigu.methode, null);
  assert.ok(ambigu.manques.includes("methode"));
});

test("le mandat et les coordonnees sont deux manques DIFFERENTS", () => {
  // Dire "coordonnees manquantes" a quelqu'un qui a tres bien rempli
  // son IBAN et qui a juste oublie de cocher le mandat l'envoie
  // chercher au mauvais endroit (regle du 25 aout).
  const v = construireVersement({
    methode: "virement", paypalEmail: null, ibanMasque: "FR14••••2606",
    titulaire: "Nina", mandatAccepteLe: null, profilFiscalComplet: false,
  });
  assert.deepEqual(v.manques, ["mandat", "profil-fiscal"]);
  assert.ok(!v.manques.includes("iban"), "son IBAN est la, ne pas le reclamer");
});

// --- l'argent ---------------------------------------------------------

function comm(over: Record<string, unknown>) {
  return {
    id: "x", sa: "sa1", status: "pending", commission_cents: 1000, currency: "EUR",
    sale_at: ANCIEN, cancelled_at: null, customer_email: "client@ex.fr",
    product_name: "Tiquiz mensuel", ...over,
  };
}

test("les quatre poches ne se recouvrent pas", () => {
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [{ sa: "sa1", email: "client@ex.fr", created_at: ANCIEN }],
    commissions: [
      comm({ id: "1", status: "paid", commission_cents: 500 }),
      comm({ id: "2", status: "approved", commission_cents: 700 }),
      comm({ id: "3", status: "pending", sale_at: RECENT, commission_cents: 300 }),
      comm({ id: "4", status: "cancelled", commission_cents: 900 }),
    ] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.argent.verseCents, 500);
  assert.equal(f.argent.aVerserCents, 700);
  assert.equal(f.argent.sousGarantieCents, 300, "vendue il y a 2 jours : encore dans les 30 jours");
  assert.equal(f.argent.annuleCents, 900);
  assert.equal(f.argent.aVenirCents, 1000, "a venir = sous garantie + a verser, jamais le verse");
});

test("une devise etrangere est COMPTEE, jamais additionnee a des euros", () => {
  // Les additionner produirait un total faux qui a l'air juste. Elles
  // sont ecartees d'un lot avec la raison `devise` (26 aout).
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [],
    commissions: [comm({ id: "1", currency: "USD", status: "approved", commission_cents: 5000 })] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.argent.autresDevises, 1);
  assert.equal(f.argent.aVerserCents, 0);
  assert.equal(f.argent.aVenirCents, 0);
});

test("les comptes GRATUITS se comptent : filleuls moins acheteurs", () => {
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [
      { sa: "sa1", email: "gratuit1@ex.fr", created_at: ANCIEN },
      { sa: "sa1", email: "gratuit2@ex.fr", created_at: ANCIEN },
      { sa: "sa1", email: "client@ex.fr", created_at: ANCIEN },
    ],
    commissions: [comm({ id: "1" })] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 3);
  assert.equal(f.acheteurs, 1);
  assert.equal(f.filleuls.length - f.acheteurs, 2);
});

// --- LE PALIER NE COMPTE QUE CEUX QUI PAIENT --------------------------
//
// Bene, 31 aout 2026 : "on compte les affilies mais seuls ceux QUI
// PAIENT permettent d'augmenter le palier de commission ! Tu veux que
// je paye des gens qui ne me rapportent rien ?? Client payant =
// augmente le %, client gratuit = aucun impact."
//
// L'ecran annoncait "encore 4 filleuls et il passe a 50 %" en comptant
// des comptes gratuits. Le calcul qui decide vraiment
// (`cron/recompense-affilies`) compte, lui, dans
// `affiliate_commissions`.

test("un compte GRATUIT ne compte pas dans le palier", () => {
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [
      { sa: "sa1", email: "gratuit1@ex.fr", created_at: ANCIEN },
      { sa: "sa1", email: "gratuit2@ex.fr", created_at: ANCIEN },
      { sa: "sa1", email: "gratuit3@ex.fr", created_at: ANCIEN },
      { sa: "sa1", email: "client@ex.fr", created_at: ANCIEN },
    ],
    commissions: [comm({ id: "1" })] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 4);
  assert.equal(f.payants, 1, "un seul a paye");

  // Avec le TOTAL, le bareme donnerait 45 % ; avec les payants, aussi,
  // mais la MARCHE annoncee change, et c'est elle que Bene a vue.
  const avecTotal = construireRecompense({
    choix: "commissions", tauxStockePct: null, tauxNegociePct: null,
    remiseStockePct: 0, filleulsPayants: f.filleuls.length,
  });
  const avecPayants = construireRecompense({
    choix: "commissions", tauxStockePct: null, tauxNegociePct: null,
    remiseStockePct: 0, filleulsPayants: f.payants,
  });
  assert.notEqual(
    avecTotal.prochaineMarcheManque,
    avecPayants.prochaineMarcheManque,
    "le test ne prouverait rien si les deux comptes donnaient la meme marche",
  );
  assert.equal(avecPayants.prochaineMarcheManque, 10, "il lui manque 10 CLIENTS PAYANTS");
});

test("une commission ANNULEE ne fait pas gagner un palier", () => {
  // Un remboursement ne doit pas laisser un palier derriere lui. Meme
  // exclusion que le cron (`cancelled` / `rejected`).
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [{ sa: "sa1", email: "rembourse@ex.fr", created_at: ANCIEN }],
    commissions: [comm({ id: "1", status: "cancelled", customer_email: "rembourse@ex.fr" })] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.payants, 0);
  assert.equal(f.acheteurs, 1, "il a bien achete un jour : les deux comptes sont differents");
});

test("un filleul qui paie douze echeances ne vaut pas douze filleuls", () => {
  // On compte des PERSONNES, pas des lignes de commission. C'est
  // exactement ce que fait le cron avec son Set d'adresses.
  const f = construireFiche({
    sa: "sa1",
    alias: new Map(),
    conversions: [{ sa: "sa1", email: "abonne@ex.fr", created_at: ANCIEN }],
    commissions: [
      comm({ id: "1", customer_email: "abonne@ex.fr" }),
      comm({ id: "2", customer_email: "abonne@ex.fr" }),
      comm({ id: "3", customer_email: "abonne@ex.fr" }),
    ] as never[],
    maintenant: MAINTENANT,
  });
  assert.equal(f.payants, 1);
});
