// tests/logic/inspecter-payload.test.mts
//
// UN JOURNAL SE LIT, IL NE SE DÉDUIT PAS (leçon du 7 août, drame Ivan).
//
// `extractSaFromPayload` cherche l'identifiant affilié dans une
// quinzaine de chemins DEVINÉS depuis le premier jour, ici comme dans
// l'Atelier. Personne n'a jamais regardé ce que Systeme.io envoie.
//
// Et on sait que ces chemins ne suffisent pas : leur API rend
// `sourceURL: "https://www.blagardette.com/trafficize"` sans `?sa=`,
// alors que la fiche du même contact affiche
// "Identifiant affilié : sa0218...".

import { test } from "node:test";
import assert from "node:assert/strict";

import { cheminsDuPayload, resumerPayload } from "@/lib/affiliate/inspecterPayload";

const SA = "sa" + "0218269404a61bdc4f28";

test("l'identifiant est trouvé même profondément imbriqué", () => {
  // C'est tout l'intérêt : la ligne de journal existante ne montrait
  // que les clés de PREMIER niveau, donc jamais celle qu'on cherche.
  const chemins = cheminsDuPayload({
    data: { contact: { affiliate: { identifier: SA } } },
  });
  const trouve = chemins.find((c) => c.identifiant === SA);
  assert.equal(trouve?.chemin, "data.contact.affiliate.identifier");
});

test("les valeurs personnelles ne sont JAMAIS journalisées", () => {
  // Un webhook de vente porte l'email, le nom, l'adresse et le montant.
  // pm2 logs finit dans un fichier, puis dans un copier-coller.
  const resume = resumerPayload({
    email: "christian@exemple.fr",
    contact: { surname: "Rappold", street_address: "17 rue des cannes" },
    order: { total_price: "47.00" },
  });
  for (const secret of ["christian@exemple.fr", "Rappold", "17 rue des cannes", "47.00"]) {
    assert.ok(!resume.includes(secret), `valeur journalisée : ${secret}`);
  }
  // Mais la FORME est bien là, c'est ce qu'on est venu chercher.
  assert.match(resume, /contact\.surname : string/);
  assert.match(resume, /order\.total_price : string/);
});

test("l'hôte d'une URL est gardé, jamais sa query", () => {
  const resume = resumerPayload({ source_url: "https://www.blagardette.com/trafficize?utm=secret" });
  assert.match(resume, /url sur www\.blagardette\.com/);
  assert.ok(!resume.includes("utm=secret"));
  assert.ok(!resume.includes("trafficize"));
});

test("un payload hostile ne tue pas la route", () => {
  // Elle est appelée sur ce qu'un tiers nous envoie. La fonction qui
  // doit AIDER à diagnostiquer ne doit pas être celle qui casse.
  const cycle: Record<string, unknown> = { nom: "a" };
  cycle.soi = cycle;
  assert.doesNotThrow(() => resumerPayload(cycle));

  const profond = { a: { b: { c: { d: { e: { f: { g: { h: SA } } } } } } } };
  assert.doesNotThrow(() => resumerPayload(profond));

  const large = { lignes: Array.from({ length: 5000 }, (_, i) => ({ i })) };
  const chemins = cheminsDuPayload(large);
  assert.ok(chemins.length < 500, "un gros tableau doit être résumé, pas déroulé");

  for (const rien of [null, undefined, 42, "texte", []]) {
    assert.doesNotThrow(() => resumerPayload(rien));
  }
});

test("le résumé dit d'abord s'il a trouvé, ou non", () => {
  assert.match(resumerPayload({ a: 1 }), /^AUCUN chemin ne porte un identifiant/);
  assert.match(resumerPayload({ x: { y: SA } }), /^IDENTIFIANT TROUVE/);
});
