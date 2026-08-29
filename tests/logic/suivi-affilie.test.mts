// tests/logic/suivi-affilie.test.mts
//
// LE TABLEAU DE SUIVI DE L'AFFILIÉ (Béné, 29 août 2026).
//
// "En tant qu'affilié où je vois mes affiliés ? Mon graph de
// statistiques ? Un vrai tableau de suivi ?"
//
// Ce fichier fige ce qui rendrait ce tableau faux ou dangereux : une
// adresse rendue en clair, une commission annulée comptée comme un
// revenu, un jour vide effacé de la courbe, et un taux affiché à 0 %
// alors qu'il est INCONNU.

import assert from "node:assert/strict";
import test from "node:test";

import {
  construireFilleuls,
  entonnoir,
  jourDe,
  masquerEmail,
  serieParJour,
} from "../../lib/affiliate/suiviAffilie.ts";

// ── L'ADRESSE ──

test("une adresse est reconnaissable, jamais reutilisable", () => {
  // Il doit pouvoir dire "ah oui, le gmail de Jocelyne" sans disposer
  // de quoi lui ecrire : ce sont les contacts de Bene, pas les siens.
  assert.equal(masquerEmail("jocelyne@gmail.com"), "j***e@gmail.com");
  assert.ok(!masquerEmail("jocelyne@gmail.com").includes("ocelyn"));
  // Une partie locale tres courte ne doit pas se retrouver en clair.
  assert.equal(masquerEmail("bo@x.fr"), "b***@x.fr");
  assert.equal(masquerEmail("a@x.fr"), "a***@x.fr");
  // Rien d'exploitable sur une valeur cassee, et surtout pas une
  // exception : un ecran ne tombe pas pour une ligne abimee.
  assert.equal(masquerEmail("pas-une-adresse"), "***");
  assert.equal(masquerEmail(""), "***");
});

// ── L'ETAT D'UN FILLEUL ──

const CONV = [
  { email: "Jocelyne@Gmail.com", created_at: "2026-08-20T10:00:00Z", channel: "youtube" },
  { email: "eric@x.fr", created_at: "2026-08-22T10:00:00Z", source: "search" },
  { email: "maurice@x.fr", created_at: "2026-08-25T10:00:00Z" },
];

test("l'etat vient des commissions, jamais d'une deduction sur le montant", () => {
  const f = construireFilleuls({
    conversions: CONV,
    ventes: [
      { customer_email: "jocelyne@gmail.com", commission_cents: 567, status: "pending", sale_at: "2026-08-21T10:00:00Z" },
      { customer_email: "eric@x.fr", commission_cents: 567, status: "cancelled", cancelled_at: "2026-08-23T10:00:00Z", sale_at: "2026-08-22T12:00:00Z" },
    ],
  });
  const par = new Map(f.map((x) => [x.masque, x]));
  assert.equal(par.get("j***e@gmail.com")!.etat, "client");
  assert.equal(par.get("e***c@x.fr")!.etat, "annule");
  assert.equal(par.get("m***e@x.fr")!.etat, "inscrit");
});

test("une commission annulee ne compte pas, mais elle reste VISIBLE", () => {
  // La faire disparaitre serait un chiffre qui baisse sans explication,
  // et l'affilie n'aurait aucun moyen de comprendre pourquoi.
  const f = construireFilleuls({
    conversions: [CONV[1]],
    ventes: [
      { customer_email: "eric@x.fr", commission_cents: 900, status: "cancelled", cancelled_at: "2026-08-23T10:00:00Z" },
    ],
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].commissionsCents, 0, "un remboursement ne se compte pas comme un revenu");
  assert.equal(f[0].etat, "annule");
});

test("l'adresse se compare sans tenir compte de la casse", () => {
  // `Jocelyne@Gmail.com` dans la conversion, `jocelyne@gmail.com` dans
  // la commission : le meme humain. Sans ca il resterait "inscrit"
  // apres avoir paye.
  const f = construireFilleuls({
    conversions: [CONV[0]],
    ventes: [{ customer_email: "JOCELYNE@gmail.com", commission_cents: 100, status: "approved" }],
  });
  assert.equal(f[0].etat, "client");
});

test("le canal qu'il a ecrit passe devant la provenance deduite", () => {
  const f = construireFilleuls({ conversions: CONV, ventes: [] });
  const par = new Map(f.map((x) => [x.masque, x]));
  assert.equal(par.get("j***e@gmail.com")!.origine, "youtube");
  assert.equal(par.get("e***c@x.fr")!.origine, "search");
  assert.equal(par.get("m***e@x.fr")!.origine, null);
});

test("le plus recent en premier", () => {
  const f = construireFilleuls({ conversions: CONV, ventes: [] });
  assert.deepEqual(f.map((x) => x.jour), ["2026-08-25", "2026-08-22", "2026-08-20"]);
});

// ── LA COURBE ──

test("les jours vides restent dans la courbe : c'est le rythme qui informe", () => {
  // Une courbe qui ne montre que les jours actifs les colle les uns aux
  // autres et ment sur la regularite.
  const s = serieParJour({
    clics: [{ created_at: "2026-08-27T09:00:00Z" }, { created_at: "2026-08-27T11:00:00Z" }],
    conversions: [{ created_at: "2026-08-29T09:00:00Z" }],
    ventes: [],
    jours: 4,
    finJour: "2026-08-29",
  });
  assert.deepEqual(s.map((p) => p.jour), ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"]);
  assert.deepEqual(s.map((p) => p.clics), [0, 2, 0, 0]);
  assert.deepEqual(s.map((p) => p.inscrits), [0, 0, 0, 1]);
});

test("ce qui tombe hors de la fenetre est IGNORE, jamais rabattu sur le bord", () => {
  // Un pic artificiel au premier jour se lit comme une vraie journee, et
  // c'est indetectable une fois affiche.
  const s = serieParJour({
    clics: [{ created_at: "2026-01-01T09:00:00Z" }],
    conversions: [],
    ventes: [],
    jours: 3,
    finJour: "2026-08-29",
  });
  assert.deepEqual(s.map((p) => p.clics), [0, 0, 0]);
});

test("une vente annulee ne fait pas de pic sur la courbe", () => {
  const s = serieParJour({
    clics: [],
    conversions: [],
    ventes: [
      { sale_at: "2026-08-29T09:00:00Z", status: "approved" },
      { sale_at: "2026-08-29T10:00:00Z", status: "cancelled", cancelled_at: "2026-08-29T12:00:00Z" },
    ],
    jours: 1,
    finJour: "2026-08-29",
  });
  assert.equal(s[0].ventes, 1);
});

test("un horodatage illisible ne casse rien", () => {
  assert.equal(jourDe("n'importe quoi"), null);
  assert.equal(jourDe(null), null);
  const s = serieParJour({
    clics: [{ created_at: "pas une date" }],
    conversions: [],
    ventes: [],
    jours: 2,
    finJour: "2026-08-29",
  });
  assert.deepEqual(s.map((p) => p.clics), [0, 0]);
});

// ── L'ENTONNOIR ──

test("un taux sur zero est INCONNU, jamais zero", () => {
  // Afficher "0 %" a quelqu'un qui n'a pas encore eu un seul clic lui
  // dit que son lien ne convertit pas, alors qu'il n'a pas servi.
  const vide = entonnoir({ clics: 0, inscrits: 0, clients: 0 });
  assert.equal(vide.tauxInscription, null);
  assert.equal(vide.tauxVente, null);
});

test("les deux taux disent OU ca coince", () => {
  const e = entonnoir({ clics: 31, inscrits: 6, clients: 1 });
  assert.equal(e.tauxInscription, 19.4, "6 inscrits sur 31 clics");
  assert.equal(e.tauxVente, 16.7, "1 client sur 6 inscrits");
});
