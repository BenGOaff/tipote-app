// tests/logic/help-locale.test.mts
//
// L'AIDE EST SERVIE DANS LA LANGUE DE CELLE QUI LA LIT.
//
// Audit de l'aide, 6 août 2026. Le centre d'aide est public et sert AUSSI
// de centre d'aide à Tiquiz : le bouton "Aide" de la sidebar Tiquiz pointe
// sur `app.tipote.com/support/tiquiz`.
//
// Or la langue de Tipote vient du cookie `ui_locale`, que le middleware ne
// posait que sur les routes PROTÉGÉES. Une cliente Tiquiz n'a pas de compte
// Tipote, donc pas de cookie sur ce domaine : elle cliquait sur "Ayuda" et
// tombait sur 57 articles en français. Pas une traduction manquante, un
// repli par défaut, et personne pour le voir.
//
// La correction tient en deux moitiés, et les DEUX comptent :
//   - Tiquiz ajoute `?lang=` à son lien (lib/help.ts, côté Tiquiz) ;
//   - la page le lit pour son rendu, le middleware le mémorise pour le
//     clic suivant (les liens internes de l'aide n'ont pas le paramètre).
//
// Ce test tient la moitié qui vit ici.

import { test } from "node:test";
import assert from "node:assert/strict";

import { askedHelpLocale, resolveHelpLocale } from "../../lib/support/locale.ts";
import { SUPPORTED_LOCALES } from "../../i18n/config.ts";

test("une langue demandée et valide gagne sur le cookie", () => {
  for (const l of SUPPORTED_LOCALES) {
    assert.equal(resolveHelpLocale(l, "fr"), l);
  }
});

test("la casse ne fait pas retomber au français", () => {
  // Ce paramètre finit dans une URL écrite à la main ou recopiée.
  // Refuser sur une majuscule, c'est refaire le bug qu'on corrige.
  assert.equal(resolveHelpLocale("PT-br", "fr"), "pt-BR");
  assert.equal(resolveHelpLocale("  ES  ", "fr"), "es");
});

test("une valeur inconnue ne traverse jamais", () => {
  // `locale` sert à construire un chemin d'import de messages : une
  // valeur non validée y serait une lecture de fichier arbitraire.
  for (const sale of ["", "  ", "de", "../../etc/passwd", "fr;rm -rf", "0", "null"]) {
    assert.equal(resolveHelpLocale(sale, "it"), "it", `"${sale}" a traversé`);
  }
  for (const pasUneChaine of [null, undefined, 42, {}, [], true]) {
    assert.equal(resolveHelpLocale(pasUneChaine, "it"), "it");
  }
});

test("askedHelpLocale distingue « rien demandé » de « demandé et refusé »", () => {
  // Le middleware en a besoin : rien demandé -> on garde le cookie ou on
  // lit l'entête du navigateur ; demandé et invalide -> pareil, mais on
  // ne doit surtout pas écrire la valeur reçue dans le cookie.
  assert.equal(askedHelpLocale(""), null);
  assert.equal(askedHelpLocale(null), null);
  assert.equal(askedHelpLocale("de"), null);
  assert.equal(askedHelpLocale("pt-br"), "pt-BR");
  assert.equal(askedHelpLocale("fr"), "fr");
});

test("le repli est celui qu'on donne, jamais une constante cachée", () => {
  // Sans paramètre, on rend EXACTEMENT ce que `getLocale()` a résolu.
  // Une valeur par défaut écrite ici serait un deuxième endroit qui
  // décide de la langue, donc un deuxième endroit qui peut mentir.
  assert.equal(resolveHelpLocale(undefined, "ar"), "ar");
  assert.equal(resolveHelpLocale(undefined, "pt-BR"), "pt-BR");
});
