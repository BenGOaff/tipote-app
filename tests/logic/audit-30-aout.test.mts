// tests/logic/audit-30-aout.test.mts
//
// AUDIT DU 30 AOÛT 2026 : LE PROGRAMME D'AFFILIATION, AVANT LANCEMENT.
//
// Béné : "j'ai trop peur de perdre mes gros affiliés sur un programme
// bancal ou des paiements cassés de leurs clients."
//
// Les deux trouvailles de cette passe ont la même forme, celle du
// 1er août : une logique écrite pour un état du produit, laissée telle
// quelle quand cet état a changé. Ici l'état qui a changé, c'est
// "Systeme.io paie les affiliés" -> "c'est nous qui virons" (25 août).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { lireCoordonnees, peutEtrePayee } from "../../lib/affiliate/coordonnees.ts";
import { tauxCommissionPct } from "../../lib/affiliate/recompense.ts";

const LANGUES = ["fr", "en", "es", "it", "pt", "ar"];

function dico(langue: string): string {
  return fs.readFileSync(path.join(process.cwd(), `app/affiliate/i18n/${langue}.ts`), "utf8");
}

// --- 1. LE GUIDE ENVOYAIT LES AFFILIÉS SE FAIRE PAYER AILLEURS -------

test("le guide n'envoie plus configurer le paiement chez Systeme.io", () => {
  // C'est la checklist qu'un NOUVEAU affilié suit. Elle lui disait d'aller
  // remplir son RIB sur systeme.io/dashboard/profile/affiliate-settings.
  // Il remplissait le leur, jamais le nôtre, et `construireLot`
  // l'écartait pour "coordonnees" : jamais payé, sans symptôme.
  // Pire : un affilié recruté depuis le 24 août n'a même pas de compte
  // Systeme.io, donc l'adresse le menait à un écran de connexion.
  for (const l of LANGUES) {
    const src = dico(l);
    const corps = /guide_step_payment_body: "([^"]*)"/.exec(src)?.[1] ?? "";
    assert.ok(corps.length > 0, `${l} : l'étape paiement n'a plus de texte`);
    assert.ok(
      !/affiliate-settings/.test(corps),
      `${l} : le guide envoie encore configurer le paiement chez Systeme.io`,
    );
  }
});

test("le guide annonce les seuils REELS du versement", () => {
  // 20 € et 30 jours sont les constantes de `versement.ts`. Un guide qui
  // annoncerait autre chose ferait attendre l'affilié au mauvais moment.
  const corps = /guide_step_payment_body: "([^"]*)"/.exec(dico("fr"))?.[1] ?? "";
  assert.match(corps, /20/, "le minimum n'est pas annoncé");
  assert.match(corps, /30 jours/, "le délai n'est pas annoncé");
  assert.match(corps, /10 et le 13/, "le calendrier n'est pas annoncé");
});

// --- 2. LA CASE COCHÉE NE PROUVAIT RIEN ------------------------------

test("l'etape paiement est DEDUITE des coordonnees, plus auto-declaree", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/affiliate/components/LaunchGuideCard.tsx"),
    "utf8",
  );
  assert.match(src, /peutEtrePayee\(/, "l'étape ne lit plus les coordonnées réelles");
  assert.ok(
    !/selfAttest: "payment_set"/.test(src),
    "l'étape paiement est redevenue auto-déclarée : on peut la cocher sans être payable",
  );
});

test("la case et le lot de versement appliquent LA MEME regle", () => {
  // C'est tout l'intérêt : `construireLot` écarte quand la méthode est
  // absente ou les coordonnées incomplètes. Si la case disait "fait"
  // dans un de ces cas, elle mentirait à l'affilié.
  const vide = lireCoordonnees({
    payout_method: null,
    paypal_email: null,
    iban_holder: null,
    iban_number: null,
  });
  assert.equal(peutEtrePayee(vide), false, "des coordonnées vides passent pour payables");

  const paypal = lireCoordonnees({
    payout_method: "paypal",
    paypal_email: "gwenn@exemple.fr",
    iban_holder: null,
    iban_number: null,
  });
  assert.equal(peutEtrePayee(paypal), true, "un PayPal complet devrait être payable");

  // Un IBAN annoncé mais absent ne doit PAS passer pour payable : c'est
  // exactement le cas qui produit un lot écarté en silence.
  const ibanManquant = lireCoordonnees({
    payout_method: "virement",
    paypal_email: null,
    iban_holder: "Gwenn Martin",
    iban_number: null,
  });
  assert.equal(peutEtrePayee(ibanManquant), false);
});

// --- 3. `?ref=` SUR UNE URL tipote.fr NE PAIE RIEN -------------------

test("le guide n'envoie plus poser ?ref= sur les pages Systeme.io", () => {
  // Verifie le 30 aout : `/api/affiliate/track` n'accepte que `sa`
  // (`isValidSa`, refus `invalid_sa`), et le script pose sur ses pages
  // Systeme.io ne lit que `?sa=` (cookie `tipote_sa`). Un `?ref=`
  // ajoute a une URL tipote.fr ne pose AUCUN cookie et n'attribue
  // AUCUNE vente. Le conseil disait l'inverse, dans les 6 langues, sur
  // l'ecran meme des contenus a partager.
  for (const l of LANGUES) {
    const info = /links_info: "([^"]*)"/.exec(dico(l))?.[1] ?? "";
    assert.ok(info.length > 0, `${l} : le conseil sur les liens a disparu`);
    assert.ok(
      !/tipote\.fr ou tipote\.blog/.test(info),
      `${l} : on conseille encore d'ajouter ?ref= a une URL tipote.fr`,
    );
    assert.match(info, /tiquiz\.fr/, `${l} : nos domaines ne sont pas nommes`);
  }
});

// --- 4. DEUX SIMULATEURS, DEUX REPONSES -----------------------------

test("le simulateur de l'espace affilie applique les MARCHES", () => {
  // Il calculait au taux de BASE quel que soit le nombre de filleuls,
  // alors que le simulateur PUBLIC (tiquiz.fr/affiliation) applique les
  // marches. Un affilie avec 30 filleuls voyait 55 % de ses gains
  // reels, sur l'ecran meme qui doit lui donner envie de pousser
  // Tiquiz.
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/affiliate/revenus/RevenueCalculator.tsx"),
    "utf8",
  );
  assert.match(src, /tauxCommissionPct\(/, "le simulateur n'applique pas les marches");
  assert.ok(
    !/commission\(tiquizPrice, COMMISSION_RATES\.tiquiz\)/.test(src),
    "le simulateur est revenu au taux fixe",
  );
});

test("les marches sont bien celles du versement", () => {
  assert.equal(tauxCommissionPct(0), 40);
  assert.equal(tauxCommissionPct(1), 45, "la marche s'ouvre au PREMIER filleul");
  assert.equal(tauxCommissionPct(30), 55);
  assert.equal(tauxCommissionPct(51), 70, "le plafond est atteint a 51");
  assert.equal(tauxCommissionPct(999), 70, "le plafond ne se depasse pas");
});
