// tests/logic/destinations-nos-domaines.test.mts
//
// LES LIENS AFFILIÉS MÈNENT CHEZ NOUS, ET ON LE VOIT QUAND CE N'EST PAS
// LE CAS.
//
// Béné, 26 août 2026, capture de son propre espace affilié à l'appui :
// "tu me sors que affiliate est à jour alors que tu sers encore l'url de
// systeme au lieu de NOTRE page avec NOTRE système d'affiliation. Nos
// pages de vente elles servent à quoi ?"
//
// Elle avait raison, et le défaut était systémique, pas ponctuel.
//
// -- CE QUI S'EST PASSÉ ------------------------------------------------
//
// `getAllLinkDestinations()` ne fait que COMPLÉTER la base avec les
// slugs qu'elle ne contient pas : les lignes de la base gagnent
// toujours. Le seed a été réécrit le 25 août pour pointer sur nos
// domaines ; la base, elle, datait du 8 juin. Chaque affilié copiait
// donc un lien vers `tipote.fr`, qui ne nous transmet pas le `?ref=` :
// la vente arrivait, et personne n'était payé.
//
// Trois couches disaient la même chose de travers, et aucune ne le
// signalait :
//   1. les lignes en base ;
//   2. l'écran d'admin, qui CONSEILLAIT les chemins Systeme.io comme
//      étant les bons, avec les prix de juin (9 EUR, 90 EUR) ;
//   3. deux liens écrits en dur dans le code.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  destinationsDivergentes,
  type DestinationLue,
} from "@/lib/affiliate/destinationsDivergentes";
import { tiquizDiscoveryUrl } from "@/lib/popquiz/appearance";

const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
/** Ce que le code attend, recopié du seed. La liste est un PARAMÈTRE de
 *  la comparaison : le test décrit le cas exact qu'il veut. */
const ATTENDUES: DestinationLue[] = [
  { slug: "atelier", path: "https://atelierduquiz.fr/" },
  { slug: "tiquiz_main", path: "https://tiquiz.fr/" },
  { slug: "tiquiz_free", path: "/part-tiquiz-gratuit" },
];

const NOS_HOTES = ["tiquiz.fr", "atelierduquiz.fr", "quiz.tipote.com", "app.tipote.com"];

// ── 1. La divergence se VOIT ──

test("une destination qui ne mene pas la ou le code l'attend est signalee", () => {
  const d = destinationsDivergentes(
    [
      { slug: "tiquiz_main", path: "/part-tiquiz" },
      { slug: "atelier", path: "/atelier-du-quiz" },
    ],
    ATTENDUES,
  );
  assert.equal(d.length, 2, "c'est exactement ce que Bene avait sous les yeux");
  assert.deepEqual(
    d.map((x: { attendu: string }) => x.attendu).sort(),
    ["https://atelierduquiz.fr/", "https://tiquiz.fr/"],
  );
});

test("une destination conforme ne fait pas de bruit", () => {
  assert.deepEqual(destinationsDivergentes([{ slug: "tiquiz_main", path: "https://tiquiz.fr/" }], ATTENDUES), []);
  // L'optin gratuit RESTE chez Systeme.io : le signaler serait un test
  // qui crie pour rien, et un test qui crie pour rien finit desactive.
  assert.deepEqual(destinationsDivergentes([{ slug: "tiquiz_free", path: "/part-tiquiz-gratuit" }], ATTENDUES), []);
  // Un slug inconnu de la base de code n'est pas notre affaire.
  assert.deepEqual(destinationsDivergentes([{ slug: "inconnu", path: "/x" }], ATTENDUES), []);
});

// ── 2. La migration couvre TOUTES les destinations, pas une ──

test("la migration repointe les 7 destinations, et epargne l'optin", () => {
  const sql = lire("supabase/migrations/20260826_destinations_nos_domaines.sql");
  for (const slug of [
    "atelier", "tiquiz_main", "tiquiz_direct",
    "tiquiz_monthly", "tiquiz_monthly_plus", "tiquiz_yearly", "tiquiz_yearly_plus",
  ]) {
    assert.match(sql, new RegExp(`slug = '${slug}'`), `${slug} n'est pas repointe`);
  }
  assert.doesNotMatch(sql, /slug = 'tiquiz_free'/, "l'optin gratuit doit rester chez Systeme.io");
  // Et elle n'ecrase JAMAIS une URL absolue posee a la main dans l'admin.
  assert.match(sql, /path not like 'https:\/\/%'/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

// ── 3. Plus aucun lien Systeme.io ecrit en dur ──

test("les liens ecrits en dur menent chez nous", () => {
  const popquiz = tiquizDiscoveryUrl(null);
  assert.ok(NOS_HOTES.includes(new URL(popquiz).hostname), popquiz);
  // Le `?sa=` du createur reste transmis : le middleware de Tiquiz le lit.
  assert.match(tiquizDiscoveryUrl("sa0016abcdef0123456789"), /[?&]sa=sa0016/);

  const essai = lire("app/affiliate/trial-tiquiz/page.tsx");
  assert.doesNotMatch(essai, /https:\/\/www\.tipote\.fr\/part-tiquiz"/, "lien Systeme.io en dur");
});

// ── 4. L'ECRAN D'ADMIN NE CONSEILLE PLUS L'INVERSE DU CODE ──

test("l'admin conseille nos domaines, pas les tunnels Systeme.io", () => {
  // Un ecran qui conseille l'inverse de ce que fait le code est pire
  // qu'un ecran sans conseil : quelqu'un qui le suit RECASSE le lien.
  const form = lire("app/affiliate/admin/links/LinksAdminForm.tsx");
  assert.match(form, /https:\/\/tiquiz\.fr\//);
  assert.match(form, /https:\/\/atelierduquiz\.fr\//);
  assert.doesNotMatch(form, /Doit etre \/part-tiquiz/, "il conseille encore le chemin Systeme.io");
  // Les prix de juin (9 / 90 EUR) ne sont plus ceux d'aujourd'hui.
  // Bornes de mot obligatoires : sans elles, "29 EUR" et "290 EUR"
  // declenchent l'alerte, et un test qui crie pour rien finit desactive.
  assert.doesNotMatch(form, /\b9 EUR\b|\b90 EUR\b/);
  assert.match(form, /17 EUR/);

  const page = lire("app/affiliate/admin/links/page.tsx");
  assert.match(page, /Destinations officielles/);
  assert.match(page, /divergencesAvecLeCode/, "la divergence n'est pas montree a l'ecran");
});
