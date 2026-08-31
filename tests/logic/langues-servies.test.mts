// tests/logic/langues-servies.test.mts
//
// SEPT LANGUES SERVIES, SEPT LANGUES ACCEPTÉES.
//
// Audit du support demandé par Béné, 31 août 2026.
//
// -- CE QUE ÇA A COÛTÉ ------------------------------------------------
//
// Le portugais et le brésilien ont été ajoutés à `i18n/config.ts` après
// coup. Cinq endroits gardaient leur propre copie de la liste, restée à
// cinq langues, et aucun ne le disait :
//
//  1. **le robot du centre d'aide était MORT en portugais.** Son corps
//     était validé par `z.enum(["fr","en","es","it","ar"])` : zod
//     refusait le corps ENTIER, la route répondait 400, et l'écran
//     affichait "une erreur est survenue" à CHAQUE message. Reproduit,
//     pas déduit ;
//  2. **la préférence de langue ne se sauvegardait pas.** Le sélecteur
//     propose les sept ; `PATCH /api/settings/ui-locale` en refusait
//     deux, et `persistLocaleToDb` avale l'erreur. Ça marchait tout de
//     suite (le cookie) et la langue revenait au français sur un autre
//     appareil ;
//  3. **les notifications de vente partaient en français** vers un
//     compte réglé en portugais.
//
// -- LA RÈGLE ---------------------------------------------------------
//
// **Une liste de langues ne se recopie pas : elle s'importe.** Ce test
// interdit qu'un nouvel endroit en réécrive une, et il vérifie que les
// tables de messages couvrent bien ce que l'app sert.
//
// **Une préférence d'affichage ne fait JAMAIS échouer une requête.** On
// normalise, on ne refuse pas : la huitième langue ajoutée un jour ne
// cassera rien.
//
// -- L'EXCEPTION, ET ELLE EST ASSUMÉE ---------------------------------
//
// `lib/affiliate/conditionsUrl.ts` liste cinq langues EXPRÈS : le texte
// des conditions n'existe pas en portugais, et demander `?lang=pt`
// servirait l'anglais en prétendant le contraire. C'est une décision
// écrite à côté du code, pas un oubli, et elle reste.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/i18n/config";
import { normaliserLangueAide, resolveHelpLocale } from "@/lib/support/locale";

const RACINE = process.cwd();
const lire = (rel: string) => fs.readFileSync(path.join(RACINE, rel), "utf8");

/** Les endroits dont la liste DOIT suivre celle de l'app. */
const DOIVENT_IMPORTER = [
  "app/api/support/chat/route.ts",
  "app/api/settings/ui-locale/route.ts",
  "app/api/systeme-io/user-webhook/route.ts",
];

/**
 * Les listes de cinq langues assumées, avec leur raison.
 *
 * Une exemption sans raison écrite est une exemption que le prochain
 * passage prend pour un oubli, ou qui couvre un jour autre chose.
 */
const EXCEPTIONS: Record<string, string> = {
  "lib/affiliate/conditionsUrl.ts":
    "le texte des conditions n'existe pas en portugais : ne pas l'envoyer vaut mieux que servir l'anglais en pretendant",
};

describe("La langue ne fait jamais echouer une question au robot d'aide", () => {
  test("LES SEPT LANGUES SONT ACCEPTÉES, portugais compris", () => {
    for (const l of SUPPORTED_LOCALES) {
      assert.equal(normaliserLangueAide(l), l, `${l} doit passer`);
    }
  });

  test("une langue illisible retombe sur le defaut, elle ne REFUSE pas", () => {
    // C'est tout le defaut : un `enum` refusait le corps entier, donc
    // la question, donc la conversation.
    assert.equal(normaliserLangueAide("klingon"), DEFAULT_LOCALE);
    assert.equal(normaliserLangueAide(""), DEFAULT_LOCALE);
    assert.equal(normaliserLangueAide(null), DEFAULT_LOCALE);
    assert.equal(normaliserLangueAide(42), DEFAULT_LOCALE);
  });

  test("la casse d'une langue recopiee a la main ne casse rien", () => {
    assert.equal(normaliserLangueAide("PT-br"), "pt-BR");
    assert.equal(normaliserLangueAide("FR"), "fr");
  });

  test("`resolveHelpLocale` peut bien rendre `pt` : c'est par la que ca arrivait", () => {
    // Sans ce maillon, on pourrait croire que le 400 etait theorique.
    assert.equal(resolveHelpLocale("pt", "fr"), "pt");
    assert.equal(resolveHelpLocale("pt-BR", "fr"), "pt-BR");
  });
});

describe("Aucun ecran ne recopie la liste des langues", () => {
  for (const rel of DOIVENT_IMPORTER) {
    test(`${rel} importe la liste au lieu de la reecrire`, () => {
      const src = lire(rel);
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      assert.ok(
        !/\[\s*"fr",\s*"en",\s*"es",\s*"it",\s*"ar"\s*\]/.test(code),
        "une liste de cinq langues recopiee : le portugais y manquera",
      );
      assert.match(src, /SUPPORTED_LOCALES|normaliserLangueAide/);
    });
  }

  test("l'exception assumee porte toujours sa raison", () => {
    // Un test qui ne peut plus echouer ment : si le fichier disparait ou
    // si sa liste change, on veut le savoir.
    for (const [rel, raison] of Object.entries(EXCEPTIONS)) {
      assert.ok(fs.existsSync(path.join(RACINE, rel)), `${rel} a disparu`);
      assert.ok(raison.length > 20, `${rel} : la raison doit rester ecrite`);
      assert.match(lire(rel), /portugais/i, `${rel} : la raison n'est plus dans le code`);
    }
  });
});

describe("Les messages envoyes couvrent ce que l'app sert", () => {
  test("une vente et une annulation se disent dans les sept langues", () => {
    // Un compte reglé en portugais recevait ses notifications en
    // francais : ca marche, donc personne ne le signale.
    const src = lire("app/api/systeme-io/user-webhook/route.ts");
    for (const table of ["SALE_MESSAGES", "CANCEL_MESSAGES"]) {
      const debut = src.indexOf(`const ${table}`);
      assert.ok(debut > 0, `${table} introuvable`);
      const bloc = src.slice(debut, src.indexOf("\n};", debut));
      for (const l of SUPPORTED_LOCALES) {
        const cle = /-/.test(l) ? `"${l}":` : `${l}:`;
        assert.ok(bloc.includes(cle), `${table} : ${l} manquant`);
      }
    }
  });

  test("le chrome du widget d'aide retombe sur l'anglais, pas le francais", () => {
    // Sa table couvre cinq langues. Une lectrice portugaise voyait le
    // widget en FRANCAIS, ce qui n'est ni sa langue ni le repli qu'on
    // utilise partout ailleurs.
    const src = lire("components/support/SupportChatWidget.tsx");
    assert.match(src, /T\[key\]\?\.\[locale\] \?\? T\[key\]\?\.en/);
  });
});
