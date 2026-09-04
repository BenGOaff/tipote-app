// tests/logic/cache-des-prompts.test.mts
//
// CE QUI SE MET EN CACHE, ET CE QUI N'A PAS LE DROIT D'Y ENTRER.
//
// Béné, 4 septembre 2026 : "beaucoup de choses sont reprises d'un user à
// l'autre alors on doit pouvoir économiser quelque part ?" Puis : "fais
// au mieux pour le jour où on aura 1000 utilisateurs intensifs."
//
// -- CE QUI A ÉTÉ MESURÉ, ET QUI A DÉCIDÉ ------------------------------
//
// Le socle était mis en cache depuis le 1er septembre, la consigne non.
// Et elle ne POUVAIT pas l'être : elle portait le profil, la piste
// choisie et l'adresse du quiz, donc AUCUNE des 15 consignes de
// production n'était la même deux fois. Mesuré : 0/15 identiques d'une
// créatrice à l'autre.
//
// Les faits ont déménagé dans le message, la consigne est devenue une
// instruction pure, et elle entre dans le préfixe caché :
//
//   entrée effective d'un appel, cache chaud : 842 -> 569 jetons (-32 %)
//   et même sur un cache froid : -9 % (bonus) à -17 % (promo)
//
// -- POURQUOI CE FILET EXISTE -----------------------------------------
//
// Le cache d'Anthropic est un préfixe EXACT et il échoue EN SILENCE :
// une variable qui repasse dans le socle ou dans la consigne ne casse
// rien, ne lève rien, n'affiche rien. Elle multiplie juste la facture
// par dix sans que personne ne le voie. La seule preuve vit dans les
// compteurs `usage` que la route journalise, et personne ne les lit tous
// les jours.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";
import {
  consigneDuQuiz,
  consignePistes,
  consigneProduction,
  lienQuizAutorise,
  messagePourLeModele,
} from "@/lib/prompts/generateurs/consignes";
import { GENERATEURS } from "@/lib/generateurs/catalogue";
import { piecesDeLaPiste } from "@/lib/generateurs/blocs";
import type { BriefQuiz } from "@/lib/generateurs/briefQuiz";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** Deux créatrices que TOUT oppose : langue, ton, titres, profils, adresse. */
const brief = (n: string, langue: string, adresse: "tu" | "vous"): BriefQuiz => ({
  titre: `Quel est ton profil ${n} ?`,
  intro: `Découvre en 3 minutes ce qui bloque (${n}).`,
  adresse,
  langue,
  tagPartage: `tag-${n}`,
  urlPublique: `https://quiz.tipote.com/q/profil-${n}`,
  bonusExistant: "",
  nbQuestions: n === "A" ? 9 : 4,
  profils: [
    { rang: 1, titre: `Team Capture ${n}`, description: `Description ${n}`, tag: `p1-${n}` },
    { rang: 2, titre: `Team Contenu ${n}`, description: `Autre ${n}`, tag: `p2-${n}` },
  ] as BriefQuiz["profils"],
});

const A = brief("A", "fr", "tu");
const B = brief("B", "es", "vous");

describe("Le préfixe caché ne dépend d'AUCUNE créatrice", () => {
  test("le socle n'interpole rien", () => {
    // S'il portait une seule valeur du brief, il changerait à chaque
    // appel : on paierait l'ÉCRITURE du cache (1,25x) sans jamais le
    // relire, c'est à dire PIRE que pas de cache du tout.
    for (const aiguille of ["A", "B", "profil-A", "Team Capture"]) {
      assert.ok(
        !SOCLE_GENERATEURS.includes(aiguille) || aiguille === "A" || aiguille === "B",
        `le socle porte "${aiguille}"`,
      );
    }
    assert.doesNotMatch(SOCLE_GENERATEURS, /\$\{/, "le socle porte une interpolation");
    assert.doesNotMatch(SOCLE_GENERATEURS, /quiz\.tipote\.com/);
  });

  test("les 15 consignes de production sont les MÊMES pour tout le monde", () => {
    let total = 0;
    for (const id of GENERATEURS) {
      for (const piece of piecesDeLaPiste(id, null)) {
        total++;
        assert.equal(
          consigneProduction({ id, piece }),
          consigneProduction({ id, piece }),
          `${id}/${piece.bloc}${piece.index} n'est pas stable`,
        );
        // Rien du brief ne doit pouvoir y entrer : la signature ne le
        // reçoit plus, et ce test le prouve sur le texte rendu.
        const rendu = consigneProduction({ id, piece });
        for (const fuite of ["Team Capture", "quiz.tipote.com", "Kit ", "Description A"]) {
          assert.ok(!rendu.includes(fuite), `${id}/${piece.bloc} laisse fuiter "${fuite}"`);
        }
      }
    }
    assert.ok(total >= 15, `seulement ${total} morceaux couverts`);
  });

  test("les consignes de pistes aussi", () => {
    for (const id of GENERATEURS) {
      assert.equal(consignePistes(id), consignePistes(id));
      assert.ok(!consignePistes(id).includes("Team Capture"));
      // La langue et le ton ne sont PAS dedans : ils multiplieraient les
      // entrées par les 100 langues du catalogue.
      assert.doesNotMatch(consignePistes(id), /TUTOIES|VOUVOIES/);
    }
  });

  test("le nombre d'entrées de cache reste petit", () => {
    // Une entrée qui ne sert qu'une fois est une écriture payée pour
    // rien. Tant qu'il y en a peu, elles restent chaudes en permanence
    // dès que le trafic monte.
    const entrees = new Set<string>();
    for (const id of GENERATEURS) {
      entrees.add(consignePistes(id));
      for (const piece of piecesDeLaPiste(id, null)) entrees.add(consigneProduction({ id, piece }));
    }
    assert.ok(entrees.size <= 25, `${entrees.size} entrées de cache, c'est trop`);
  });
});

describe("Ce qui dépend de la créatrice vit APRÈS le cache", () => {
  test("la langue et le ton sont dans le bloc variable, et lui seul", () => {
    assert.notEqual(consigneDuQuiz(A), consigneDuQuiz(B));
    assert.match(consigneDuQuiz(A), /TUTOIES/);
    assert.match(consigneDuQuiz(B), /VOUVOIES/);
  });

  test("le profil, la piste et l'adresse du quiz sont dans le MESSAGE", () => {
    const msg = messagePourLeModele({
      brief: A,
      offres: [],
      profil: A.profils[0],
      piste: { titre: "Le kit", format: "checklist", punchline: "En dix minutes" },
      lienQuiz: A.urlPublique,
      demande: "Vas y.",
    });
    assert.match(msg, /Team Capture A/);
    assert.match(msg, /Le kit/);
    assert.match(msg, /quiz\.tipote\.com\/q\/profil-A/);
  });

  test("l'adresse du quiz ne sort QUE là où elle doit apparaître", () => {
    // Le contenu d'un bonus se lit hors ligne : y coller l'adresse
    // renverrait le lecteur vers le quiz qu'il vient de finir.
    assert.equal(lienQuizAutorise("promo", "post"), true);
    assert.equal(lienQuizAutorise("promo", "email"), true);
    assert.equal(lienQuizAutorise("bonus", "remise"), true);
    assert.equal(lienQuizAutorise("bonus", "contenu"), false);
    assert.equal(lienQuizAutorise("bonus", "guide"), false);
    assert.equal(lienQuizAutorise("emails", "email"), false);
    // Sans lien passé, le message n'en invente pas un.
    const sans = messagePourLeModele({ brief: A, offres: [], lienQuiz: "", demande: "Vas y." });
    assert.ok(!sans.includes("quiz.tipote.com"));
  });
});

describe("Ce que la route envoie vraiment", () => {
  const route = lire("app/api/generateurs/route.ts");

  test("trois blocs système, DEUX points de cache, dans cet ordre", () => {
    const bloc = route.slice(route.indexOf("system: ["), route.indexOf("messages: [{ role"));
    assert.ok(bloc.indexOf("SOCLE_GENERATEURS") < bloc.indexOf("text: fixe"), "le socle passe en premier");
    assert.ok(bloc.indexOf("text: fixe") < bloc.indexOf("text: variable"), "le variable passe en dernier");
    assert.equal((bloc.match(/cache_control/g) ?? []).length, 2, "il faut exactement 2 points de cache");
    // Le bloc variable ne doit JAMAIS en porter un : il change à chaque
    // créatrice, donc ce serait une écriture jamais relue.
    const apres = bloc.slice(bloc.indexOf("text: variable"));
    assert.ok(!apres.includes("cache_control"), "le bloc variable porte un point de cache");
  });

  test("le TTL reste à 5 minutes, et la raison est écrite à côté", () => {
    // Une LECTURE relance le compteur sans rien coûter : dès que deux
    // appels partent à moins de 5 minutes d'écart, l'entrée ne meurt
    // jamais. Le TTL d'une heure coûte 2x l'écriture au lieu de 1,25x et
    // n'achète rien dans ce cas là. Une exemption sans sa raison écrite
    // est une exemption que le prochain passage prend pour un oubli.
    assert.ok(!route.includes('ttl: "1h"'), "le TTL d'une heure a été posé sans mesure");
    // On lit la PROSE, donc on retire d'abord les `//` : sinon le test
    // rougit sur un simple retour à la ligne, ce qui est le contraire
    // d'un garde-fou.
    const prose = route.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");
    assert.match(prose, /TTL : 5 minutes/);
    assert.match(prose, /Une lecture RELANCE le compteur/);
    assert.match(prose, /trafic CREUX/);
  });

  test("la consigne fixe part bien du côté caché, et le brief du côté message", () => {
    assert.match(route, /consigneProduction\(\{ id, piece \}\)/);
    assert.match(route, /consigneDuQuiz\(brief\)/);
    assert.match(route, /lienQuiz: lienQuizAutorise\(id, piece\.bloc\)/);
  });
});
