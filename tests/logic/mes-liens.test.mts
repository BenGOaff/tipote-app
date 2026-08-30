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
  type HorsLien,
  type LigneLien,
} from "../../lib/affiliate/mesLiens.ts";

const NOMS = new Map([
  ["tiquiz_main", "Page Tiquiz principale"],
  ["atelier", "L'Atelier du Quiz"],
]);

const VIDE: CompteursParLien = {
  clics: new Map(),
  visiteurs: new Map(),
  inscrits: new Map(),
  payants: new Map(),
  commissions: new Map(),
};

const RIEN_HORS_LIEN: HorsLien = {
  clics: 0,
  visiteurs: 0,
  inscrits: 0,
  payants: 0,
  commissionsCents: 0,
};

/** Les clics d'un lien, comme ils arrivent maintenant : de `affiliate_clicks`. */
function clics(paires: [string, number][]): CompteursParLien {
  return { ...VIDE, clics: new Map(paires) };
}

function build(
  liens: LigneLien[],
  compteurs: CompteursParLien = VIDE,
  horsLien: HorsLien = RIEN_HORS_LIEN,
) {
  return construireMesLiens({
    liens,
    compteurs,
    nomsDestinations: NOMS,
    refCode: "jocelyne",
    destinationsConnues: new Set(NOMS.keys()),
    origine: "https://affiliate.tipote.com",
    destinationParDefaut: "tiquiz_main",
    horsLien,
    nomLienParDefaut: "Lien de base",
    urlLienParDefaut: "https://tiquiz.fr/?ref=jocelyne",
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
  const liens = build(
    [
      { id: "vieux", destination: "tiquiz_main", channel: "blog", short_code: "a", created_at: "2026-01-01T00:00:00Z" },
      { id: "star", destination: "tiquiz_main", channel: "youtube", short_code: "b", created_at: "2026-08-01T00:00:00Z" },
      { id: "moyen", destination: "atelier", channel: "newsletter", short_code: "c", created_at: "2026-05-01T00:00:00Z" },
    ],
    clics([["vieux", 5], ["star", 915], ["moyen", 96]]),
  );
  assert.deepEqual(liens.map((l) => l.id), ["star", "moyen", "vieux"]);
});

test("a clics egaux, le plus recent d'abord", () => {
  const liens = build([
    { id: "ancien", destination: "tiquiz_main", channel: "a", short_code: "1", created_at: "2026-01-01T00:00:00Z" },
    { id: "neuf", destination: "tiquiz_main", channel: "b", short_code: "2", created_at: "2026-08-01T00:00:00Z" },
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
    clics: new Map([["star", 915], ["vide", 1]]),
    visiteurs: new Map([["star", 700]]),
    inscrits: new Map([["star", 6]]),
    payants: new Map([["star", 2]]),
    commissions: new Map([["star", 4200]]),
  };
  const liens = build(
    [
      { id: "star", destination: "tiquiz_main", channel: "youtube", short_code: "a" },
      { id: "vide", destination: "atelier", channel: "blog", short_code: "b" },
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
    clics: new Map([["a", 915], ["b", 96]]),
    visiteurs: new Map([["a", 700], ["b", 80]]),
    inscrits: new Map([["a", 6], ["b", 1]]),
    payants: new Map([["a", 2]]),
    commissions: new Map([["a", 4200], ["b", 800]]),
  };
  const liens = build(
    [
      { id: "a", destination: "tiquiz_main", channel: "youtube", short_code: "1" },
      { id: "b", destination: "atelier", channel: "blog", short_code: "2" },
    ],
    compteurs,
  );
  assert.deepEqual(totauxDesLiens(liens), {
    liens: 2,
    clics: 1011,
    visiteurs: 780,
    inscrits: 7,
    payants: 2,
    commissionsCents: 5000,
  });
});

test("une destination retiree du catalogue reste AFFICHEE, avec ses clics", () => {
  // Elle disparaissait jusqu'au 29 aout, et ses clics avec elle : le
  // total du bandeau baissait sans que personne ne puisse constater
  // pourquoi. Une ligne qu'on ne sait plus nommer vaut mieux qu'un
  // chiffre faux.
  const liens = build(
    [{ id: "1", destination: "destination_disparue", channel: "x", short_code: "a" }],
    clics([["1", 10]]),
  );
  assert.equal(liens.length, 1);
  assert.equal(liens[0].clics, 10);
  assert.equal(liens[0].destinationConnue, false);
});

test("aucun lien : le tableau est vide, il ne plante pas", () => {
  assert.deepEqual(build([]), []);
  assert.deepEqual(totauxDesLiens([]), {
    liens: 0,
    clics: 0,
    visiteurs: 0,
    inscrits: 0,
    payants: 0,
    commissionsCents: 0,
  });
});

// ── LE BUG DU 29 AOÛT : ZÉRO CLIC ALORS QU'IL Y EN AVAIT 31 ──
//
// Béné : "mon dashboard dans affiliate me compte 0 clics alors que j'ai
// shooté mon lien hier et que sur pilotage il me compte 6 inscrits.
// Donc lequel est juste ?"
//
// Pilotage était juste. Les quatre chiffres de l'espace affilié
// sommaient un tableau qui ne contenait QUE les liens passés par le
// redirecteur `/go/`, alors que le lien distribué par Promouvoir est
// `tiquiz.fr/?ref=<code>` : ses clics s'enregistrent sans `link_id`,
// donc ils n'avaient aucune ligne où apparaître.

test("le lien de base a SA ligne : un clic sans link_id n'est jamais invisible", () => {
  const liens = build([], VIDE, {
    clics: 31,
    visiteurs: 20,
    inscrits: 6,
    payants: 0,
    commissionsCents: 0,
  });
  assert.equal(liens.length, 1, "sans cette ligne, l'ecran annonce zero a quelqu'un qui a 31 clics");
  assert.equal(liens[0].parDefaut, true);
  assert.equal(liens[0].clics, 31);
  assert.equal(liens[0].inscrits, 6);
  // C'est le lien qu'elle partage vraiment, pas une adresse fabriquee
  // pour l'occasion.
  assert.equal(liens[0].url, "https://tiquiz.fr/?ref=jocelyne");
  // Il n'est jamais passe par le redirecteur : il n'a pas de code
  // court, et on n'en invente pas un qui ne repondrait pas.
  assert.equal(liens[0].urlCourte, null);
  // Il vit dans des videos deja publiees.
  assert.equal(liens[0].supprimable, false);
});

test("les quatre chiffres du haut disent la VERITE du compte", () => {
  // C'est la reponse a "lequel est juste ?" : le total du bandeau doit
  // egaler ce que compte la vue `affiliate_stats` lue par la console de
  // pilotage, sinon les deux ecrans se contredisent sur la meme journee.
  const liens = build(
    [{ id: "yt", destination: "tiquiz_main", channel: "youtube", short_code: "a" }],
    clics([["yt", 9]]),
    { clics: 31, visiteurs: 20, inscrits: 6, payants: 1, commissionsCents: 567 },
  );
  const t = totauxDesLiens(liens);
  assert.equal(t.clics, 40, "9 par le lien nomme + 31 par le lien de base");
  assert.equal(t.inscrits, 6);
  assert.equal(t.commissionsCents, 567);
  // Le lien de base n'est pas un lien qu'elle a cree : elle en a UN.
  assert.equal(t.liens, 1);
});

test("rien du tout : pas de ligne fantome pour le lien de base", () => {
  // Une ligne a zero sur un compte neuf ferait croire a un lien qui
  // existe et ne marche pas, alors qu'il n'a simplement jamais servi.
  assert.deepEqual(build([], VIDE, RIEN_HORS_LIEN), []);
});

test("les clics ne viennent JAMAIS d'un compteur pose sur le lien", () => {
  // `affiliate_links.clicks_count` existe et personne ne l'incremente :
  // le lire remettait toute la colonne a zero, meme pour une affiliee
  // qui utilise bien ses liens `/go/`. Le compteur est ignore, y
  // compris si quelqu'un le repose un jour dans la ligne.
  const avecCompteurMenteur = [
    { id: "yt", destination: "tiquiz_main", channel: "youtube", short_code: "a", clicks_count: 999 },
  ] as unknown as LigneLien[];
  const [l] = build(avecCompteurMenteur, clics([["yt", 12]]));
  assert.equal(l.clics, 12);
});
