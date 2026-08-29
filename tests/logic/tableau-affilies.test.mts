// tests/logic/tableau-affilies.test.mts
//
// LE SUIVI D'UN AFFILIÉ (Béné, 29 août 2026).
//
// "Sur mes affiliés je dois voir : leur code ref, leur id sa si dispo,
// le nombre de clics qu'ils ont reçu, leur nombre d'affiliés, leur
// commission passées, présentes et futures."
//
// Chaque colonne de ce tableau est un chiffre sur lequel un affilié va
// se juger, et sur lequel Béné va payer. Une erreur y coûte soit un
// versement de trop, soit un affilié qui croit ne rien gagner.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  construireTableauAffilies,
  trierAffilies,
  type EntreeAffilie,
} from "@/lib/affiliate/tableauAffilies";
import type { CommissionAVerser } from "@/lib/affiliate/versement";

const MAINTENANT = Date.parse("2026-08-29T12:00:00Z");
const JOUR = 24 * 60 * 60 * 1000;

const ERIC: EntreeAffilie = {
  sa: "sa015482041700065688e89f0e48925ec6c81def4e",
  ref: "eric-legrigeois",
  email: "legrigeoiseric@gmail.com",
  display_name: "Eric Legrigeois",
  status: "active",
};
const ANCIEN_ERIC = "sa013476947331a3b65a708ef70cabd5809b547764";

function commission(p: Partial<CommissionAVerser>): CommissionAVerser {
  return {
    id: "c1",
    sa: ERIC.sa,
    status: "pending",
    commission_cents: 680,
    currency: "EUR",
    sale_at: new Date(MAINTENANT - 60 * JOUR).toISOString(),
    ...p,
  };
}

function base(sur: Partial<Parameters<typeof construireTableauAffilies>[0]> = {}) {
  return construireTableauAffilies({
    affilies: [ERIC],
    alias: new Map(),
    clics: [],
    conversions: [],
    commissions: [],
    maintenant: MAINTENANT,
    ...sur,
  });
}

test("UN ANCIEN IDENTIFIANT COMPTE POUR SON PROPRIÉTAIRE", () => {
  // C'est tout l'objet de l'alias posé le 29 août : les liens d'Eric en
  // circulation portent son ancien identifiant. Sans la traduction, son
  // tableau afficherait zéro clic alors qu'il travaille, ce qui est
  // exactement le problème qu'on venait de fermer.
  const [l] = base({
    alias: new Map([[ANCIEN_ERIC, ERIC.sa]]),
    clics: [{ sa: ANCIEN_ERIC }, { sa: ANCIEN_ERIC }, { sa: ERIC.sa }],
    conversions: [{ sa: ANCIEN_ERIC, email: "client@exemple.fr" }],
  });
  assert.equal(l.clics, 3);
  assert.equal(l.filleuls, 1);
  assert.deepEqual(l.alias, [ANCIEN_ERIC]);
});

test("un filleul qui revient ne compte qu'UNE fois", () => {
  // La même personne peut cliquer et revenir. La compter deux fois
  // gonflerait un chiffre dont il se sert pour se juger.
  const [l] = base({
    conversions: [
      { sa: ERIC.sa, email: "client@exemple.fr" },
      { sa: ERIC.sa, email: "Client@Exemple.FR" },
      { sa: ERIC.sa, email: "autre@exemple.fr" },
    ],
  });
  assert.equal(l.filleuls, 2);
});

test("LES TROIS TEMPS DE L'ARGENT sont séparés", () => {
  const [l] = base({
    commissions: [
      commission({ id: "a", status: "paid", commission_cents: 1000 }),
      commission({ id: "b", status: "approved", commission_cents: 500 }),
      // Vendue hier : la garantie de 30 jours n'est pas passée.
      commission({
        id: "c",
        status: "pending",
        commission_cents: 300,
        sale_at: new Date(MAINTENANT - 1 * JOUR).toISOString(),
      }),
      commission({ id: "d", status: "cancelled", commission_cents: 200 }),
    ],
  });
  assert.equal(l.verseesCents, 1000);
  assert.equal(l.aVerserCents, 500);
  assert.equal(l.sousGarantieCents, 300);
  assert.equal(l.annuleesCents, 200);
});

test("une commission mûre passe en À VERSER sans attendre le lot", () => {
  // Elle est encore `pending` en base : c'est le lot qui la passera en
  // `approved`. L'écran doit dire ce qui est GAGNÉ, pas ce qui a déjà
  // été traité, sinon il annonce zéro jusqu'au 10 du mois.
  const [l] = base({
    commissions: [
      commission({ sale_at: new Date(MAINTENANT - 45 * JOUR).toISOString() }),
    ],
  });
  assert.equal(l.aVerserCents, 680);
  assert.equal(l.sousGarantieCents, 0);
});

test("UNE COMMISSION REMBOURSÉE NE SE PAIE PAS, même mûre", () => {
  const [l] = base({
    commissions: [
      commission({
        sale_at: new Date(MAINTENANT - 90 * JOUR).toISOString(),
        cancelled_at: new Date(MAINTENANT - 80 * JOUR).toISOString(),
      }),
    ],
  });
  assert.equal(l.aVerserCents, 0);
  assert.equal(l.annuleesCents, 680);
});

test("UNE AUTRE DEVISE NE S'ADDITIONNE PAS AUX EUROS", () => {
  // Trois plans Tiquiz en dollars existent chez Systeme.io depuis
  // avril. Les ajouter produirait un chiffre faux qui a l'air juste.
  const [l] = base({
    commissions: [
      commission({ id: "usd", currency: "USD", commission_cents: 5000, status: "approved" }),
      commission({ id: "eur", currency: "EUR", commission_cents: 680, status: "approved" }),
    ],
  });
  assert.equal(l.aVerserCents, 680);
  // Mais elle n'est pas invisible : il a gagné cet argent.
  assert.equal(l.autresDevises, 1);
});

test("un affilié sans code public est SIGNALÉ par un ref null", () => {
  // Sans code, aucun lien `?ref=` ne peut le désigner : il est enfermé
  // dans l'ancien système et l'écran doit pouvoir le dire.
  const [l] = base({ affilies: [{ ...ERIC, ref: null }] });
  assert.equal(l.ref, null);
});

test("un statut illisible est lu comme actif", () => {
  // Refuser de payer quelqu'un sur une valeur qu'on ne sait pas lire
  // serait la pire des réponses (règle du 26 août).
  const [l] = base({ affilies: [{ ...ERIC, status: null }] });
  assert.equal(l.statut, "active");
});

test("une commission d'un identifiant INCONNU n'est attribuée à personne", () => {
  const [l] = base({ commissions: [commission({ sa: "sa00inconnu0000000000000000000000000000" })] });
  assert.equal(l.verseesCents + l.aVerserCents + l.sousGarantieCents, 0);
});

test("CELUI QUI TRAVAILLE LE PLUS EST EN HAUT", () => {
  // Trier par date d'inscription mettrait le plus ancien en tête et le
  // meilleur en bas (même raison que le tableau de ses liens).
  const lignes = construireTableauAffilies({
    affilies: [
      { sa: "sa0aa11223344556677889900aabbccddeeff", email: "petit@x.fr" },
      { sa: "sa0bb11223344556677889900aabbccddeeff", email: "gros@x.fr" },
    ],
    alias: new Map(),
    clics: [],
    conversions: [],
    commissions: [
      commission({ id: "g", sa: "sa0bb11223344556677889900aabbccddeeff", status: "paid", commission_cents: 9000 }),
      commission({ id: "p", sa: "sa0aa11223344556677889900aabbccddeeff", status: "paid", commission_cents: 100 }),
    ],
    maintenant: MAINTENANT,
  });
  assert.equal(trierAffilies(lignes)[0].email, "gros@x.fr");
});
