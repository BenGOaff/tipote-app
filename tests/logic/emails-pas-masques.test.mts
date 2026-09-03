// tests/logic/emails-pas-masques.test.mts
//
// CLOUDFLARE MASQUAIT LES ADRESSES DES PAGES LEGALES (3 septembre 2026).
//
// L'option « Email Address Obfuscation » remplace toute adresse du HTML
// SERVI par <span class="__cf_email__">[email protected]</span>. Un
// lecteur sans JavaScript (le validateur OAuth de Google, un robot, un
// lecteur d'ecran degrade) lit donc une politique de confidentialite
// sans aucune adresse de contact, alors que le texte en promet une.
//
// MESURE DU 3 SEPTEMBRE, avec l'agent de Googlebot, en production :
//
//   app.tipote.com/legal/privacy      5 masquees
//   app.tipote.com/legal/extension    1
//   atelierduquiz.fr/privacy          1
//   atelierduquiz.fr/legal            1
//   tiquiz.fr/privacy                 0  (corrige le 2 septembre)
//
// Tiquiz avait ete corrige seul : UN GARDE-FOU QUI NE PROTEGE QU'UN DES
// JUMEAUX NE PROTEGE PERSONNE. Ce test vit donc dans les trois depots.
//
// Il lit la SOURCE, pas la page rendue : le rendu depend de Cloudflare,
// qu'aucun test ne peut interroger depuis un runner. Ce qu'on fige, c'est
// que les marqueurs sont POSES et que la raison reste ecrite a cote.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lire = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

describe("les adresses des pages legales ne sont pas masquees par Cloudflare", () => {
  test("le composant pose les deux marqueurs officiels", () => {
    const src = lire("components/legal/SansObfuscationEmail.tsx");
    assert.match(src, /<!--email_off-->/, "le marqueur d'ouverture manque");
    assert.match(src, /<!--email_on-->/, "le marqueur de fermeture manque");
  });

  test("la raison est ecrite a cote, sinon le prochain passage les retire", () => {
    const src = lire("components/legal/SansObfuscationEmail.tsx");
    assert.match(src, /Cloudflare/, "le commentaire ne nomme pas la cause");
    assert.match(src, /__cf_email__/, "il ne nomme pas ce que Cloudflare injecte");
  });

  // Les deux ecrans legaux de Tipote : la route dynamique (privacy, cgu,
  // cgv, mentions, cookies) et la page de l'extension, qui rend son JSX
  // au lieu du HTML du corpus. Les deux portent une adresse, les deux
  // etaient masquees.
  for (const ecran of ["app/legal/[slug]/page.tsx", "app/legal/extension/page.tsx"]) {
    test(`${ecran} enveloppe son contenu`, () => {
      const src = lire(ecran);
      assert.match(src, /<SansObfuscationEmail>/, "le contenu n'est pas enveloppe");
      assert.match(src, /<\/SansObfuscationEmail>/, "l'enveloppe n'est pas refermee");
    });
  }

  // Un test qui ne peut plus echouer ment : si ces ecrans perdent leurs
  // adresses, l'enveloppe ne protege plus rien et le test doit le dire.
  test("ces ecrans portent bien encore une adresse email", () => {
    const corpus = lire("lib/legal/content.ts") + lire("app/legal/extension/page.tsx");
    assert.match(corpus, /@(tipote|ethilife)\.(fr|com)/, "plus aucune adresse a proteger");
  });
});
