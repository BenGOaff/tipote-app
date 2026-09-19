// tests/logic/rattachement-manuel.test.mts
//
// « JE DOIS TOUT SAVOIR SUR TOUT, DE FAÇON FIABLE ET SÉCURISÉE »
// (Béné, 18 septembre 2026)
//
// "Je ne veux pas créditer automatiquement un affilié, en revanche s'il
// me prouve que le lien n'a pas fonctionné, je veux pouvoir lui
// attribuer un client manuellement... Je dois être sûre que untel est
// envoyé par untel et que untel a envoyé telle et telle et telle
// personne."
//
// -- LES DEUX CHOSES QUE CE FICHIER TIENT ------------------------------
//
// 1. **UN GESTE MANUEL NE SE CONFOND PAS AVEC UNE MESURE.** Avant,
//    `affiliate_conversions` disait QUI et QUAND, jamais COMMENT : un
//    rattachement décidé à la main se lisait exactement comme un clic
//    mesuré. Le jour d'un litige entre deux affiliés sur le même client,
//    il n'y avait rien à opposer à personne.
//
// 2. **LE PREMIER RATTACHEMENT GAGNE** (règle du 26 août), et l'écraser
//    est un GESTE, pas un réglage. Sans `remplacer` en paramètre séparé,
//    on prendrait un filleul à un affilié pour le donner à un autre sans
//    que personne le voie.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  forceDeLaPreuve,
  verdictRattachementManuel,
  type DemandeRattachementManuel,
} from "../../lib/affiliate/rattachementManuel.ts";

const lire = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const BASE: DemandeRattachementManuel = {
  email: "cliente@exemple.fr",
  sa: "sa_greg",
  affilieActif: true,
  estSoiMeme: false,
  decidePar: "blagardette@gmail.com",
  remplacer: false,
  etat: { saActuel: null, origineActuelle: null },
};

describe("Le geste manuel", () => {
  test("PERSONNE EN FACE : on crée, et c'est le cas courant", () => {
    assert.deepEqual(verdictRattachementManuel(BASE), { action: "creer" });
  });

  test("DÉJÀ LE MÊME : on ne fait rien, et ce n'est pas une erreur", () => {
    const v = verdictRattachementManuel({
      ...BASE,
      etat: { saActuel: "sa_greg", origineActuelle: "clic" },
    });
    assert.equal(v.action, "rien");
  });

  test("DÉJÀ QUELQU'UN D'AUTRE : ON S'ARRÊTE ET ON LE NOMME", () => {
    // LE TEST LE PLUS IMPORTANT DE CE FICHIER. Sans cet arrêt, un clic
    // de travers retire un filleul à l'affilié qui a fait le travail.
    const v = verdictRattachementManuel({
      ...BASE,
      etat: { saActuel: "sa_jocelyne", origineActuelle: "clic" },
    });
    assert.equal(v.action, "conflit");
    assert.equal(v.action === "conflit" && v.saEnPlace, "sa_jocelyne");
  });

  test("ET ON NE REMPLACE QUE SI ON L'A DEMANDÉ EXPLICITEMENT", () => {
    // `remplacer` est un PARAMÈTRE SÉPARÉ, pas une conséquence. C'est la
    // même mécanique que `base` pour les commissions (26 août) : un
    // appelant muet ne peut pas faire le geste dangereux par accident.
    const v = verdictRattachementManuel({
      ...BASE,
      remplacer: true,
      etat: { saActuel: "sa_jocelyne", origineActuelle: "clic" },
    });
    assert.equal(v.action, "remplacer");
    assert.equal(v.action === "remplacer" && v.saRemplace, "sa_jocelyne");
  });
});

describe("Ce qu'on refuse", () => {
  test("UN GESTE NON SIGNÉ", () => {
    // Ce rattachement vaut 40 % de chaque échéance, pour toujours. Il
    // doit pouvoir s'expliquer six mois plus tard.
    for (const qui of [null, "", "   "]) {
      const v = verdictRattachementManuel({ ...BASE, decidePar: qui });
      assert.equal(v.action, "refus");
      assert.equal(v.action === "refus" && v.motif, "non_signe");
    }
  });

  test("UN AFFILIÉ INCONNU OU EXCLU", () => {
    assert.equal(
      verdictRattachementManuel({ ...BASE, sa: null }).action === "refus" &&
        (verdictRattachementManuel({ ...BASE, sa: null }) as { motif: string }).motif,
      "affilie_inconnu",
    );
    // Un affilié `banned` ou `paused` ne reçoit pas un filleul neuf.
    const exclu = verdictRattachementManuel({ ...BASE, affilieActif: false });
    assert.equal(exclu.action, "refus");
    assert.equal(exclu.action === "refus" && exclu.motif, "affilie_inconnu");
  });

  test("SOI MÊME, ALIAS COMPRIS", () => {
    // La même règle que la commission et le mois offert. Un affilié qui
    // s'attribue ses propres achats n'est pas un affilié.
    const v = verdictRattachementManuel({ ...BASE, estSoiMeme: true });
    assert.equal(v.action, "refus");
    assert.equal(v.action === "refus" && v.motif, "soi_meme");
  });

  test("UNE ADRESSE QUI N'EN EST PAS UNE", () => {
    for (const mauvaise of ["", "greg", "   "]) {
      const v = verdictRattachementManuel({ ...BASE, email: mauvaise });
      assert.equal(v.action, "refus");
      assert.equal(v.action === "refus" && v.motif, "adresse_invalide");
    }
  });
});

describe("La force de la preuve", () => {
  test("MESURÉ, DÉCLARÉ, INCONNU : trois mots, et ils ne se confondent pas", () => {
    // On a VU la requête passer.
    for (const o of ["clic", "inscription", "vente"] as const) {
      assert.equal(forceDeLaPreuve(o), "mesuree", o);
    }
    // Quelqu'un l'a décidé, ou l'a repris d'ailleurs. Légitime, et pas
    // une mesure.
    assert.equal(forceDeLaPreuve("manuel"), "declaree");
    assert.equal(forceDeLaPreuve("import_sio"), "declaree");
    // `null` est une VRAIE réponse : les lignes d'avant le 18 septembre
    // n'ont pas d'origine mesurée, et écrire "clic" dessus serait une
    // affirmation que personne n'a faite.
    assert.equal(forceDeLaPreuve(null), "inconnue");
  });
});

describe("Ce que la source doit garantir", () => {
  test("CHAQUE CHEMIN AUTOMATIQUE ÉCRIT SON ORIGINE", () => {
    // Sans ça, la traçabilité ne vaudrait que pour les gestes manuels,
    // c'est à dire pour une poignée de lignes sur des milliers.
    const chemins: Array<[string, string]> = [
      ["app/api/affiliate/rattacher/route.ts", "inscription"],
      ["app/api/affiliate/track/route.ts", "clic"],
      ["app/api/affiliate/sio-conversion/route.ts", "import_sio"],
      ["app/api/partner/affilies/rattachement/route.ts", "manuel"],
    ];
    for (const [f, origine] of chemins) {
      assert.match(lire(f), new RegExp(`origine: "${origine}"`), `${f} n'ecrit pas son origine`);
    }
  });

  test("LA ROUTE MANUELLE EXIGE LE SECRET, EN TEMPS CONSTANT", () => {
    const src = lire("app/api/partner/affilies/rattachement/route.ts");
    assert.match(src, /safeEqual\(/);
    assert.match(src, /PARTNER_SHARED_SECRET/);
    // L'absence FERME, et on refuse sans dire pourquoi : annoncer "le
    // secret n'est pas configure" dirait a qui frappe qu'il y a quelque
    // chose derriere.
    assert.match(src, /Boolean\(SHARED\)/);
  });

  test("UN REMPLACEMENT ÉCRIT UNE LIGNE NEUVE, il ne réécrit pas l'histoire", () => {
    // Editer la ligne d'origine effacerait le fait qu'il y a eu un
    // remplacement, et sa date a lui.
    const src = lire("app/api/partner/affilies/rattachement/route.ts");
    const i = src.indexOf('verdict.action === "remplacer"');
    assert.ok(i > 0);
    const bloc = src.slice(i, i + 900);
    assert.match(bloc, /\.delete\(\)/);
    assert.ok(!bloc.includes(".update("), "le remplacement modifie la ligne d'origine");
  });

  test("UN REFUS MÉTIER RÉPOND 200 AVEC UNE RAISON", () => {
    // Cloudflare remplace le corps d'un 5xx (3 septembre) : un refus lu
    // par un ECRAN doit porter sa raison, pas une page d'erreur.
    const src = lire("app/api/partner/affilies/rattachement/route.ts");
    assert.match(src, /ok: false, reason: verdict\.motif/);
    assert.match(src, /reason: "rattache_a_un_autre"/);
  });
});
