// tests/logic/identite-fiscale.test.mts
//
// LA FICHE DE L'AFFILIÉ SE REMPLIT TOUTE SEULE (Béné, 27 août 2026).
//
// "Pareil pour les affiliés, on utilise tout ce qu'on peut pour limiter
// les risques d'erreur et les actions à faire."
//
// Ce n'est pas un confort de saisie. Un profil fiscal incomplet ÉCARTE
// l'affilié du lot de versement : il a gagné son argent, il ne le reçoit
// pas, et il faut lui écrire. Chaque champ rempli à sa place est une
// occasion de moins de rester bloqué.
//
// CE QUE CE TEST PROTÈGE : le refus de bricoler. Un formulaire à moitié
// rempli avec des valeurs fausses est PIRE qu'un formulaire vide, parce
// que la personne le relit moins.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { chercherSirene, lireReponseSirene, lireSiren, sirenDepuisTvaFr } from "@/lib/affiliate/sirene";
import { resoudreTvaAutofacture } from "@/lib/affiliate/fiscal";
import { lireProfilFiscal } from "@/lib/affiliate/fiscal";

// ── LE SIREN ─────────────────────────────────────────────────────────

test("un SIREN se lit malgré les espaces de la saisie humaine", () => {
  assert.equal(lireSiren("123456789"), "123456789");
  assert.equal(lireSiren("123 456 789"), "123456789");
});

test("un SIRET n'est PAS un SIREN", () => {
  // Le SIRET désigne un établissement, pas l'entreprise : l'annuaire ne
  // répondrait pas la même chose.
  assert.equal(lireSiren("12345678900012"), null);
  assert.equal(lireSiren("12345"), null);
  assert.equal(lireSiren(null), null);
});

test("la ville n'est pas écrite deux fois", () => {
  // L'annuaire donne l'adresse ENTIÈRE, code postal et commune compris.
  // Sans la coupe, la ville se retrouverait dans le champ Adresse ET
  // dans le champ Ville.
  const v = lireReponseSirene({
    results: [
      {
        nom_raison_sociale: "ETHILIFE",
        siege: {
          adresse: "12 RUE NEUVE 75002 PARIS",
          code_postal: "75002",
          libelle_commune: "PARIS",
        },
      },
    ],
  });
  assert.equal(v.denomination, "ETHILIFE");
  assert.equal(v.adresse, "12 RUE NEUVE");
  assert.equal(v.codePostal, "75002");
  assert.equal(v.ville, "PARIS");
});

test("une reponse qu'on ne comprend pas ne remplit RIEN", () => {
  const vide = { denomination: null, adresse: null, codePostal: null, ville: null };
  assert.deepEqual(lireReponseSirene(null), vide);
  assert.deepEqual(lireReponseSirene({ results: [] }), vide);
  assert.deepEqual(lireReponseSirene("bonjour"), vide);
  assert.deepEqual(lireReponseSirene({ results: [{}] }), vide);
});

test("un champ manquant ne devient pas une chaine bricolee", () => {
  const v = lireReponseSirene({ results: [{ nom_complet: "ACME", siege: {} }] });
  assert.equal(v.denomination, "ACME");
  assert.equal(v.adresse, null);
  assert.equal(v.ville, null);
});

test("l'annuaire qui tombe ne leve jamais", async () => {
  const casse = (async () => {
    throw new Error("réseau coupé");
  }) as unknown as typeof fetch;
  const v = await chercherSirene("123456789", casse);
  assert.equal(v.denomination, null);
});

// ── VIES SUR L'AUTOFACTURE ───────────────────────────────────────────

const belge = () =>
  lireProfilFiscal({
    statut: "entreprise",
    denomination: "ACME SPRL",
    adresse: "Rue Neuve 12",
    ville: "Bruxelles",
    codePostal: "1000",
    pays: "BE",
    siren: null,
    numeroTva: "BE0123456789",
    assujettiTva: true,
    mandatAccepteLe: "2026-08-01T00:00:00Z",
    mandatVersion: 1,
  });

test("VIES valide : l'autofacture ne sort plus marquee", () => {
  const d = resoudreTvaAutofacture(belge(), "valide");
  assert.equal(d.regime, "autoliquidation-ue");
  assert.ok(!d.aVerifier.includes("tva-a-valider-vies"));
});

test("VIES invalide : la piece est marquee, elle n'est pas emise en silence", () => {
  // C'est Bene qui emet la piece, donc c'est elle qui porte une
  // autoliquidation injustifiee. La forme ne prouvait rien.
  const d = resoudreTvaAutofacture(belge(), "invalide");
  assert.ok(d.aVerifier.includes("tva-numero-refuse-vies"));
});

test("VIES injoignable : comportement d'avant, et on le DIT", () => {
  // Un virement bloque parce que la Commission europeenne redemarrait
  // serait pire que le doute.
  for (const v of ["injoignable", "non-verifie"] as const) {
    const d = resoudreTvaAutofacture(belge(), v);
    assert.equal(d.regime, "autoliquidation-ue");
    assert.ok(d.aVerifier.includes("tva-a-valider-vies"), v);
  }
});

// -- LE NUMERO DE TVA FRANCAIS PORTE SON SIREN (27 aout 2026) ----------
//
// Bene tape son numero, clique Remplir, et lit "l'annuaire ne repond
// pas". Le message etait VRAI : VIES avait repondu
// `MS_MAX_CONCURRENT_REQ` (service de l'Etat membre sature). Rien dans
// la console parce qu'il n'y avait pas d'erreur.
//
// Pour un numero francais, VIES est le mauvais annuaire : bride en
// nombre d'appels, alors que le SIREN est DANS le numero et que SIRENE
// repond tout de suite avec l'adresse deja decoupee.

test("le SIREN se lit dans le numéro de TVA français, sans réseau", () => {
  assert.equal(sirenDepuisTvaFr("FR38909349045"), "909349045");
  // La saisie humaine met des espaces, des points, des minuscules.
  assert.equal(sirenDepuisTvaFr("fr 38 909 349 045"), "909349045");
  assert.equal(sirenDepuisTvaFr("FR38.909349045"), "909349045");
});

test("une faute de frappe sur la clé ne part nulle part", () => {
  // (12 + 3 * (SIREN mod 97)) mod 97 vaut 38 pour ce SIREN. Un chiffre
  // change donne un numéro plausible et un annuaire qui répond à côté.
  assert.equal(sirenDepuisTvaFr("FR39909349045"), null);
  assert.equal(sirenDepuisTvaFr("FR38909349046"), null);
});

test("les vieux numéros à clé alphanumérique restent acceptés", () => {
  // Leur clé ne se recalcule pas. Les refuser écarterait des
  // entreprises anciennes pour rien, alors que le SIREN est là.
  assert.equal(sirenDepuisTvaFr("FRK7909349045"), "909349045");
});

test("un numéro qui n'est pas français n'est pas détourné vers SIRENE", () => {
  // Le SIREN n'existe qu'en France : VIES reste le seul annuaire pour
  // les autres pays de l'Union.
  assert.equal(sirenDepuisTvaFr("BE0123456789"), null);
  assert.equal(sirenDepuisTvaFr("DE123456789"), null);
  assert.equal(sirenDepuisTvaFr(""), null);
  assert.equal(sirenDepuisTvaFr(null), null);
});

test("la route envoie un numéro français vers SIRENE, pas vers VIES", () => {
  const src = readFileSync("app/api/affiliate/identite/route.ts", "utf8");
  const posSiren = src.indexOf("sirenDepuisTvaFr(numeroTva)");
  const posVies = src.indexOf("interrogerVies(numeroTva)");
  assert.ok(posSiren > 0, "la route n'essaie plus de lire le SIREN du numéro");
  assert.ok(
    posSiren < posVies,
    "VIES est interrogé avant d'avoir vu qu'il s'agit d'un numéro français",
  );
});
