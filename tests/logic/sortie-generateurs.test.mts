// tests/logic/sortie-generateurs.test.mts
//
// LA LONGUEUR DE CE QU'ON ÉCRIT, ET LE REFUS DE LIVRER UN DEMI CONTENU.
//
// Béné, 4 septembre 2026 : "comment on peut régler le problème des
// tokens en sortie sans perdre en qualité ? Je préfère payer plutôt que
// de générer de la merde, mais je veux économiser tout ce qui est
// possible de l'être. Attention à ne jamais rien tronquer, il faut
// contrôler mais sans jamais délivrer un demi contenu."
//
// -- CE QUE CE FILET TIENT, ET POURQUOI -------------------------------
//
// 1. LA LONGUEUR VIT À UN SEUL ENDROIT. Avant, trois blocs sur six
//    annonçaient un nombre de mots dans le TEXTE de leur consigne, les
//    trois autres n'en annonçaient aucun, et le plafond `max_tokens`
//    vivait dans un ternaire de la route. Deux endroits qui disent la
//    longueur finissent toujours par ne plus dire la même chose, et
//    c'est le plafond qui a raison contre le texte : il COUPE.
//
// 2. LE PLAFOND NE BAISSE JAMAIS. On paie ce qui est ÉCRIT, pas ce qui
//    était permis : resserrer un plafond n'économise pas un centime, ça
//    ne fait qu'ajouter du risque de couper. Mon premier jet dérivait
//    des plafonds plus SERRÉS qu'avant (un email passait de 1800 à
//    900) : c'est exactement la faute que ce test attrape.
//
// 3. UN MORCEAU COUPÉ EST REFUSÉ, jamais rendu. Un bandeau ne répare
//    pas une phrase qui s'arrête au milieu.
//
// 4. ON NE MONTE PAS LE PLAFOND POUR AUTANT. Mesuré côté Atelier : au
//    delà de ~4500 jetons de sortie, la génération sort du budget de
//    85 secondes et rend ZÉRO ligne. Monter le plafond échangerait une
//    troncature contre une page blanche.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PLAFOND_DUR,
  consigneDeLongueur,
  longueurDuMorceau,
} from "@/lib/generateurs/longueurSortie";
import { BLOCS_DU_GENERATEUR, type Bloc } from "@/lib/generateurs/blocs";
import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";
import { consigneProduction } from "@/lib/prompts/generateurs/consignes";
import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * UN TEST QUI MESURE LA PRÉSENCE OU L'ORDRE DE QUELQUE CHOSE DANS UN
 * FICHIER RETIRE D'ABORD LES COMMENTAIRES, sinon il tombe sur sa propre
 * explication et sort vert (ou rouge) pour rien. Payé trois fois cette
 * semaine.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Les couples (générateur, bloc) qui existent vraiment. */
const COUPLES: { id: GenerateurId; bloc: Bloc }[] = GENERATEURS.flatMap((id) =>
  BLOCS_DU_GENERATEUR[id].map((bloc) => ({ id, bloc })),
);

/**
 * LES PLAFONDS D'AVANT LE 4 SEPTEMBRE, relevés dans le ternaire de la
 * route avant de le retirer. Ce sont des FAITS, pas une formulation :
 * les figer est ce qui empêche un plafond de redescendre.
 */
const PLAFOND_AVANT: Record<string, number> = {
  "bonus:contenu": 4200,
  "bonus:guide": 1800,
  "bonus:remise": 1800,
  "emails:email": 1800,
  "promo:email": 1800,
  "promo:post": 900,
};

describe("la longueur de chaque morceau", () => {
  test("chaque bloc qui existe a une fourchette, et elle a du sens", () => {
    for (const { id, bloc } of COUPLES) {
      const l = longueurDuMorceau(id, bloc);
      assert.ok(l.mots.min > 0, `${id}:${bloc} : un plancher à zéro`);
      assert.ok(
        l.mots.max > l.mots.min,
        `${id}:${bloc} : la fourchette est vide ou inversée`,
      );
      // Une fourchette trop large ne dit rien : le modèle vise alors le
      // haut, ce qui est exactement ce qu'on retire.
      assert.ok(
        l.mots.max <= l.mots.min * 2,
        `${id}:${bloc} : fourchette trop large (${l.mots.min}-${l.mots.max})`,
      );
    }
  });

  test("AUCUN plafond ne descend en dessous de celui d'avant", () => {
    for (const { id, bloc } of COUPLES) {
      const avant = PLAFOND_AVANT[`${id}:${bloc}`];
      assert.ok(avant, `${id}:${bloc} : plafond d'avant inconnu, complète la table`);
      const { plafond } = longueurDuMorceau(id, bloc);
      assert.ok(
        plafond >= avant,
        `${id}:${bloc} : le plafond descend de ${avant} à ${plafond}. ` +
          "Resserrer n'économise RIEN (on paie ce qui est écrit) et rend la coupure plus probable.",
      );
    }
  });

  test("et aucun ne dépasse le budget de temps", () => {
    for (const { id, bloc } of COUPLES) {
      assert.ok(
        longueurDuMorceau(id, bloc).plafond <= PLAFOND_DUR,
        `${id}:${bloc} : au delà de ${PLAFOND_DUR} jetons la génération rend ZÉRO ligne`,
      );
    }
  });

  test("le plafond laisse largement la place à la longueur demandée", () => {
    for (const { id, bloc } of COUPLES) {
      const l = longueurDuMorceau(id, bloc);
      // 1,5 jeton par mot : il faut que le modèle puisse écrire bien
      // plus que la fourchette avant d'être coupé, sinon le filet
      // devient un couperet.
      assert.ok(
        l.plafond >= l.mots.max * 1.5 * 2,
        `${id}:${bloc} : plafond ${l.plafond} trop serré pour ${l.mots.max} mots`,
      );
    }
  });

  test("un couple inconnu a quand même un plafond", () => {
    const l = longueurDuMorceau("promo" as GenerateurId, "guide" as Bloc);
    assert.ok(l.plafond > 0);
    assert.ok(l.mots.max > 0);
  });
});

describe("elle est DITE au modèle, et à un seul endroit", () => {
  test("la consigne de production porte la fourchette du morceau", () => {
    for (const { id, bloc } of COUPLES) {
      const l = longueurDuMorceau(id, bloc);
      const texte = consigneProduction({
        id,
        piece: { bloc, index: 1, resume: "", cle: undefined },
      });
      assert.ok(
        texte.includes(`entre ${l.mots.min} et ${l.mots.max} mots`),
        `${id}:${bloc} : la consigne n'annonce pas sa longueur`,
      );
    }
  });

  test("elle dit aussi de COUPER le moins utile, jamais de s'arrêter au milieu", () => {
    const phrase = consigneDeLongueur(longueurDuMorceau("bonus", "contenu"));
    assert.match(phrase, /jamais un texte qui s'arrête au milieu/);
  });

  test("AUCUN nombre de mots n'est réécrit à la main dans les consignes", () => {
    // C'est la faute d'origine : "Le corps tient en moins de 300 mots."
    // était écrit dans le texte de trois consignes, à côté d'un plafond
    // qui vivait ailleurs.
    const src = sansCommentaires(lire("lib/prompts/generateurs/consignes.ts"));
    const enDur = src.match(/\d+\s*mots/g) ?? [];
    assert.deepEqual(
      enDur,
      [],
      `une longueur écrite en dur dans consignes.ts : ${enDur.join(", ")}`,
    );
  });

  test("et la consigne DÉLÈGUE à longueurSortie", () => {
    const src = sansCommentaires(lire("lib/prompts/generateurs/consignes.ts"));
    assert.match(src, /consigneDeLongueur\(\s*longueurDuMorceau\(/);
  });
});

describe("on ne délivre JAMAIS un demi contenu", () => {
  const route = sansCommentaires(lire("app/api/generateurs/route.ts"));

  test("le plafond vient du module, plus d'un ternaire dans la route", () => {
    assert.match(route, /longueurDuMorceau\(id, piece\.bloc\)/);
    assert.doesNotMatch(
      route,
      /piece\.bloc === "contenu" \? \d+/,
      "le ternaire de plafonds est revenu dans la route",
    );
  });

  test("un morceau coupé est REFUSÉ, pas rendu", () => {
    assert.match(
      route,
      /if \(out\.tronque\) return refus\("coupe"\)/,
      "un texte coupé repart vers l'écran au lieu d'être refusé",
    );
  });

  test("le refus tombe AVANT l'enregistrement et avant la réponse", () => {
    const refusCoupe = route.indexOf('return refus("coupe")');
    const enregistre = route.indexOf("await rangerMorceau(");
    const repond = route.indexOf("return NextResponse.json({\n    ok: true,\n    bloc:");
    assert.ok(refusCoupe > 0, "le refus n'existe pas");
    assert.ok(enregistre > 0);
    assert.ok(
      refusCoupe < enregistre,
      "un morceau coupé serait enregistré dans la bibliothèque avant d'être refusé",
    );
    if (repond > 0) assert.ok(refusCoupe < repond);
  });

  test("un seul nouveau tirage, et seulement s'il reste du temps", () => {
    assert.match(
      route,
      /if \(out\.ok && out\.tronque && budgetLeft\(\) > 45_000\)/,
      "le nouveau tirage n'est pas gardé par le budget de temps : il rendrait zéro ligne",
    );
    // Deux reprises coûteraient deux morceaux pour un seul livré.
    // On compte les RÉAFFECTATIONS, pas les `const out = await ...` des
    // deux autres branches : un test qui ne distingue pas ce qu'il est
    // censé distinguer est pire qu'un test absent.
    assert.equal(
      (route.match(/(?<!(?:const|let) )out = await appeler\(/g) ?? []).length,
      1,
      "plus d'un nouveau tirage sur troncature",
    );
  });

  test("et on ne monte pas le plafond pour rattraper une coupure", () => {
    assert.doesNotMatch(
      route,
      /plafond\s*[*+]\s*\d/,
      "un plafond augmenté au deuxième essai échange une coupure contre une page blanche",
    );
  });
});

describe("ce qui ne se paie pas et qu'on retire quand même", () => {
  test("le socle interdit la conclusion sur le travail", () => {
    // Le préambule était déjà interdit, la CONCLUSION non : "n'hésite
    // pas à adapter" est de la sortie payée qui ne sert à personne.
    assert.match(SOCLE_GENERATEURS, /n'hésite pas à adapter/);
    assert.match(SOCLE_GENERATEURS, /Le dernier mot du texte est le dernier mot du contenu/);
  });

  test("la raison `coupe` existe dans les 7 langues", () => {
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const m = JSON.parse(lire(`messages/${loc}.json`)) as {
        generateurs: { erreurs: Record<string, string> };
      };
      const phrase = m.generateurs.erreurs.coupe;
      assert.ok(phrase && phrase.trim().length > 20, `${loc} : raison coupe absente`);
      assert.ok(!/—|–/.test(phrase), `${loc} : tiret cadratin dans la phrase`);
    }
  });

  test("et l'écran la connaît, sinon il affiche la phrase générique", () => {
    const src = lire("app/generateurs/[generateur]/GenerateurClient.tsx");
    assert.match(src, /"coupe",/);
  });
});
