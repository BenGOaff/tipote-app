// tests/logic/mes-liens.test.mts
//
// UN LIEN PAR CANAL, ET CHACUN SAIT CE QU'IL RAPPORTE.
//
// Béné, 24 août 2026, en montrant l'espace ambassadeur de Waalaxy :
// "j'aime beaucoup ce qu'ils font c'est moderne et ça donne envie".
//
// Ce qu'ils font de mieux, c'est une LIGNE PAR LIEN NOMMÉ avec ses
// propres chiffres : "Lien par défaut" 915 clics, "Upgrade" 96, "Demo"
// 5. En un coup d'oeil, on sait quel canal travaille.
//
// Ce fichier fige les trois choses qui rendraient ce tableau faux :
// un lien qui ne compte pas ses clics, un ordre qui enterre le meilleur
// canal, et un lien par défaut supprimable.

import assert from "node:assert/strict";
import test from "node:test";

import {
  construireMesLiens,
  nomDuLien,
  totauxDesLiens,
  type CompteursParLien,
  type LigneLien,
} from "../../lib/affiliate/mesLiens.ts";

const NOMS = new Map([
  ["tiquiz_main", "Page Tiquiz principale"],
  ["atelier", "L'Atelier du Quiz"],
]);

const VIDE: CompteursParLien = { inscrits: new Map(), payants: new Map(), commissions: new Map() };

function build(liens: LigneLien[], compteurs: CompteursParLien = VIDE) {
  return construireMesLiens({
    liens,
    compteurs,
    nomsDestinations: NOMS,
    refCode: "jocelyne",
    destinationsConnues: new Set(NOMS.keys()),
    origine: "https://affiliate.tipote.com",
    destinationParDefaut: "tiquiz_main",
  });
}

// ── LE LIEN COMPTE SES CLICS ──

test("le lien passe par NOTRE redirecteur, sinon rien n'est compte", () => {
  // Un lien qui va droit sur la page de vente commissionne toujours (le
  // `?ref=` est propage), mais ses chiffres restent a zero POUR
  // TOUJOURS, et l'affiliee conclut que son canal ne marche pas.
  const [l] = build([
    { id: "1", destination: "tiquiz_main", channel: null, short_code: "a7k" },
  ]);
  assert.equal(l.url, "https://affiliate.tipote.com/go/jocelyne/tiquiz_main");
  assert.equal(l.urlCourte, "https://affiliate.tipote.com/j/a7k");
});

test("le canal est le dernier segment : c'est lui qui distingue les liens", () => {
  const [l] = build([
    { id: "1", destination: "tiquiz_main", channel: "youtube", short_code: "b2c" },
  ]);
  assert.equal(l.url, "https://affiliate.tipote.com/go/jocelyne/tiquiz_main/youtube");
});

test("un canal a caracteres speciaux ne casse pas le lien", () => {
  const [l] = build([
    { id: "1", destination: "tiquiz_main", channel: "story mardi", short_code: "c3d" },
  ]);
  assert.ok(!l.url.includes(" "), l.url);
});

// ── LE NOM QU'ELLE RECONNAÎT ──

test("le nom est SON canal, sinon la destination, jamais un identifiant", () => {
  // Un tableau ou toutes les lignes s'appellent `tiquiz_main` ne se lit
  // pas : c'est exactement ce qu'on ne veut pas.
  assert.equal(
    nomDuLien({ id: "1", destination: "tiquiz_main", channel: "youtube", short_code: "x" }, NOMS),
    "youtube",
  );
  assert.equal(
    nomDuLien({ id: "1", destination: "tiquiz_main", channel: null, short_code: "x" }, NOMS),
    "Page Tiquiz principale",
  );
  // Destination inconnue du dictionnaire : on rend le slug plutot que
  // rien. Une ligne sans nom serait pire.
  assert.equal(
    nomDuLien({ id: "1", destination: "inconnue", channel: "  ", short_code: "x" }, NOMS),
    "inconnue",
  );
});

// ── L'ORDRE ──

test("le meilleur canal passe en premier, jamais le plus vieux", () => {
  // Trier par date mettrait son plus vieux lien en haut et son meilleur
  // canal en bas : elle veut voir ce qui MARCHE.
  const liens = build([
    { id: "vieux", destination: "tiquiz_main", channel: "blog", short_code: "a", clicks_count: 5, created_at: "2026-01-01T00:00:00Z" },
    { id: "star", destination: "tiquiz_main", channel: "youtube", short_code: "b", clicks_count: 915, created_at: "2026-08-01T00:00:00Z" },
    { id: "moyen", destination: "atelier", channel: "newsletter", short_code: "c", clicks_count: 96, created_at: "2026-05-01T00:00:00Z" },
  ]);
  assert.deepEqual(liens.map((l) => l.id), ["star", "moyen", "vieux"]);
});

test("a clics egaux, le plus recent d'abord", () => {
  const liens = build([
    { id: "ancien", destination: "tiquiz_main", channel: "a", short_code: "1", clicks_count: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "neuf", destination: "tiquiz_main", channel: "b", short_code: "2", clicks_count: 0, created_at: "2026-08-01T00:00:00Z" },
  ]);
  assert.deepEqual(liens.map((l) => l.id), ["neuf", "ancien"]);
});

// ── CE QU'ON NE SUPPRIME PAS ──

test("le lien par defaut ne se supprime pas : il vit dans des videos", () => {
  // Meme garantie que les anciens codes : un lien mort est une vente
  // perdue pour toujours, et elle ne saura jamais laquelle.
  const [defaut] = build([
    { id: "1", destination: "tiquiz_main", channel: null, short_code: "a" },
  ]);
  assert.equal(defaut.supprimable, false);

  const [canal] = build([
    { id: "2", destination: "tiquiz_main", channel: "youtube", short_code: "b" },
  ]);
  assert.equal(canal.supprimable, true);
});

// ── LES CHIFFRES ──

test("chaque lien porte SES chiffres, pas ceux du voisin", () => {
  const compteurs: CompteursParLien = {
    inscrits: new Map([["star", 6]]),
    payants: new Map([["star", 2]]),
    commissions: new Map([["star", 4200]]),
  };
  const liens = build(
    [
      { id: "star", destination: "tiquiz_main", channel: "youtube", short_code: "a", clicks_count: 915 },
      { id: "vide", destination: "atelier", channel: "blog", short_code: "b", clicks_count: 1 },
    ],
    compteurs,
  );
  const star = liens.find((l) => l.id === "star")!;
  assert.equal(star.inscrits, 6);
  assert.equal(star.payants, 2);
  assert.equal(star.commissionsCents, 4200);

  const vide = liens.find((l) => l.id === "vide")!;
  assert.equal(vide.inscrits, 0);
  assert.equal(vide.commissionsCents, 0);
});

test("les totaux du bandeau sont la SOMME du tableau", () => {
  // Deux chiffres calcules separement finissent toujours par se
  // contredire, et celui du haut est celui qu'elle croit.
  const compteurs: CompteursParLien = {
    inscrits: new Map([["a", 6], ["b", 1]]),
    payants: new Map([["a", 2]]),
    commissions: new Map([["a", 4200], ["b", 800]]),
  };
  const liens = build(
    [
      { id: "a", destination: "tiquiz_main", channel: "youtube", short_code: "1", clicks_count: 915 },
      { id: "b", destination: "atelier", channel: "blog", short_code: "2", clicks_count: 96 },
    ],
    compteurs,
  );
  assert.deepEqual(totauxDesLiens(liens), {
    liens: 2,
    clics: 1011,
    inscrits: 7,
    payants: 2,
    commissionsCents: 5000,
  });
});

test("une destination retiree du catalogue ne montre pas un lien sans nom", () => {
  const liens = build([
    { id: "1", destination: "destination_disparue", channel: "x", short_code: "a", clicks_count: 10 },
  ]);
  assert.equal(liens.length, 0);
});

test("aucun lien : le tableau est vide, il ne plante pas", () => {
  assert.deepEqual(build([]), []);
  assert.deepEqual(totauxDesLiens([]), {
    liens: 0,
    clics: 0,
    inscrits: 0,
    payants: 0,
    commissionsCents: 0,
  });
});
