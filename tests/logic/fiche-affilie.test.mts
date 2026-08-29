// tests/logic/fiche-affilie.test.mts
//
// LA FICHE D'UN AFFILIÉ (Béné, 29 août 2026).
//
// "Je veux voir qui sont leurs affiliés, et pour leurs clients je veux
// voir qui est leur affilié."
//
// Une fiche ne répond pas "combien il a gagné" (le tableau le dit
// déjà), mais QUI il a amené et ce que ces gens ont fait ensuite : dix
// inscrits et zéro achat, ce n'est pas le même message qu'un inscrit
// qui a pris l'annuel.

import { test } from "node:test";
import assert from "node:assert/strict";

import { construireFiche, etatCommission } from "@/lib/affiliate/ficheAffilie";
import type { CommissionAVerser } from "@/lib/affiliate/versement";

const SA = "sa015482041700065688e89f0e48925ec6c81def4e";
const ANCIEN = "sa013476947331a3b65a708ef70cabd5809b547764";
const MAINTENANT = Date.parse("2026-08-29T12:00:00Z");
const JOUR = 24 * 60 * 60 * 1000;

function comm(p: Partial<CommissionAVerser & { customer_email: string; product_name: string }>) {
  return {
    id: "c",
    sa: SA,
    status: "paid",
    commission_cents: 680,
    currency: "EUR",
    sale_at: "2026-08-01T10:00:00Z",
    customer_email: "client@x.fr",
    product_name: "Tiquiz mensuel",
    ...p,
  } as CommissionAVerser & { customer_email: string; product_name: string };
}

test("la fiche montre QUI il a amené et ce qu'ils ont acheté", () => {
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [
      { sa: SA, email: "client@x.fr", created_at: "2026-07-01T10:00:00Z" },
      { sa: SA, email: "curieux@x.fr", created_at: "2026-07-15T10:00:00Z" },
    ],
    commissions: [comm({})],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 2);
  assert.equal(f.acheteurs, 1);
  assert.equal(f.filleuls[0].email, "client@x.fr");
  assert.equal(f.filleuls[0].achats[0].produit, "Tiquiz mensuel");
  assert.equal(f.filleuls[0].arriveLe, "2026-07-01T10:00:00Z");
});

test("CEUX QUI ONT ACHETÉ SONT EN HAUT, pas les derniers arrivés", () => {
  // Un rangement par date mettrait en haut celui qui vient de cliquer,
  // et tout en bas celui qui a pris l'annuel.
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [
      { sa: SA, email: "acheteur@x.fr", created_at: "2026-01-01T10:00:00Z" },
      { sa: SA, email: "hier@x.fr", created_at: "2026-08-28T10:00:00Z" },
    ],
    commissions: [comm({ customer_email: "acheteur@x.fr" })],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls[0].email, "acheteur@x.fr");
});

test("UN ANCIEN IDENTIFIANT REMPLIT SA FICHE", () => {
  // Sans la traduction par alias, sa fiche serait vide alors qu'il
  // travaille.
  const f = construireFiche({
    sa: SA,
    alias: new Map([[ANCIEN, SA]]),
    conversions: [{ sa: ANCIEN, email: "vieux@x.fr", created_at: "2026-06-01T10:00:00Z" }],
    commissions: [comm({ sa: ANCIEN, customer_email: "vieux@x.fr" })],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 1);
  assert.equal(f.filleuls[0].gagneCents, 680);
});

test("LA PLUS ANCIENNE ARRIVÉE GAGNE : c'est le rattachement à vie", () => {
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [
      { sa: SA, email: "c@x.fr", created_at: "2026-08-01T10:00:00Z" },
      { sa: SA, email: "c@x.fr", created_at: "2026-02-01T10:00:00Z" },
    ],
    commissions: [],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls[0].arriveLe, "2026-02-01T10:00:00Z");
});

test("une commission ANNULÉE reste visible mais ne compte pas", () => {
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [],
    commissions: [comm({ status: "cancelled" })],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls[0].achats.length, 1);
  assert.equal(f.filleuls[0].achats[0].etat, "annulee");
  assert.equal(f.filleuls[0].gagneCents, 0);
});

test("UNE DEVISE ÉTRANGÈRE NE S'ADDITIONNE PAS, et reste affichée", () => {
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [],
    commissions: [comm({ currency: "USD", commission_cents: 5000 })],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls[0].gagneCents, 0);
  assert.equal(f.filleuls[0].achats[0].devise, "USD");
});

test("un achat SANS ADRESSE ne disparaît pas de la fiche", () => {
  // Le faire disparaitre ferait manquer de l'argent dans la fiche.
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [],
    commissions: [comm({ customer_email: "" })],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 1);
  assert.match(f.filleuls[0].email, /inconnue/);
});

test("l'état d'un achat suit la MÊME règle que les versements", () => {
  assert.equal(etatCommission(comm({ status: "paid" }), MAINTENANT), "versee");
  assert.equal(etatCommission(comm({ status: "approved" }), MAINTENANT), "a-verser");
  assert.equal(
    etatCommission(
      comm({ status: "pending", sale_at: new Date(MAINTENANT - 45 * JOUR).toISOString() }),
      MAINTENANT,
    ),
    "a-verser",
  );
  assert.equal(
    etatCommission(
      comm({ status: "pending", sale_at: new Date(MAINTENANT - 2 * JOUR).toISOString() }),
      MAINTENANT,
    ),
    "sous-garantie",
  );
});

test("les filleuls d'un AUTRE affilié n'entrent pas dans sa fiche", () => {
  const f = construireFiche({
    sa: SA,
    alias: new Map(),
    conversions: [{ sa: "sa00autre111122223333444455556666", email: "pas-lui@x.fr" }],
    commissions: [],
    maintenant: MAINTENANT,
  });
  assert.equal(f.filleuls.length, 0);
});
