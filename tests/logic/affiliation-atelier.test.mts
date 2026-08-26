// tests/logic/affiliation-atelier.test.mts
//
// L'ATELIER PASSE SUR NOTRE SYSTÈME D'AFFILIATION (26 août 2026).
//
// Béné : "je veux notre propre système d'affiliation pour l'atelier
// comme pour tiquiz, je pensais que tu avais déjà bossé dessus."
//
// Ce que ces tests protègent, et chaque ligne vaut de l'argent :
// 1. le TAUX. `attributeSale` portait `const PRODUIT = "tiquiz"` en dur :
//    une vente Atelier y serait payée 40 % au lieu de 70 %, sur chaque
//    vente, sans le moindre symptôme ;
// 2. l'échelle de fidélité (40 -> 70 %) est celle de TIQUIZ. Appliquée à
//    l'Atelier, dont la base est déjà 70 %, elle ne peut que faire
//    DESCENDRE la commission : un affilié récompensé serait puni ;
// 3. la contrainte SQL `source_app in ('tipote','tiquiz')` REFUSAIT la
//    ligne, donc la commission disparaissait dans le webhook ;
// 4. le lien Atelier de l'espace affilié ne payait PERSONNE depuis le
//    24 août (un `?ref=` posé sur un tunnel Systeme.io).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { COMMISSION_RATES, resolveCommissionRate } from "@/lib/affiliate/commission";

const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// ── 1. Le taux dépend du produit, et il est OBLIGATOIRE ──

test("l'Atelier paie 70%, Tiquiz 40%", () => {
  assert.equal(COMMISSION_RATES.atelier, 0.7);
  assert.equal(COMMISSION_RATES.tiquiz, 0.4);
  assert.equal(resolveCommissionRate({ product: "atelier" }), 0.7);
  assert.equal(resolveCommissionRate({ product: "tiquiz" }), 0.4);
});

test("le produit est un PARAMÈTRE de attributeSale, jamais une constante", () => {
  const src = lire("lib/affiliate/attribution.ts");
  // La constante d'avant, celle qui aurait payé l'Atelier à 40 %.
  assert.doesNotMatch(
    src,
    /const PRODUIT[^\n]*=\s*"tiquiz"/,
    "le produit est redevenu une constante : une vente Atelier paierait 40%",
  );
  assert.match(src, /produit: ProduitCommission;/, "le champ obligatoire a disparu");
  assert.match(src, /product: input\.produit/, "le taux ne suit plus le produit reçu");
});

test("l'échelle de fidélité ne s'applique QU'À Tiquiz", () => {
  const src = lire("lib/affiliate/attribution.ts");
  assert.match(src, /function palierApplicable/);
  assert.match(src, /produit === "tiquiz"/);
  // Le calcul lui même : un palier à 55% ne doit pas écraser les 70%.
  assert.equal(resolveCommissionRate({ product: "atelier", tierRate: 0.55 }), 0.55);
  // (la fonction applique ce qu'on lui donne : c'est l'APPELANT qui doit
  // se taire, et c'est ce que `palierApplicable` garantit.)
  assert.equal(resolveCommissionRate({ product: "atelier", tierRate: null }), 0.7);
});

// ── 2. La porte accepte l'Atelier, et en déduit le produit ──

test("la route d'attribution accepte `atelier` et en tire le taux", () => {
  const src = lire("app/api/affiliate/attribute-sale/route.ts");
  assert.match(src, /body\.source_app !== "atelier"/, "une vente Atelier serait refusée en 400");
  assert.match(
    src,
    /const produit = body\.source_app === "atelier" \? "atelier" : "tiquiz"/,
    "le produit ne se déduit plus de l'app qui a vendu",
  );
  // Pas de champ `produit` dans le corps : un drapeau de plus est un
  // drapeau qu'un appelant finit par oublier, et l'oublier paierait 40%.
  assert.doesNotMatch(src, /body\.produit/);
});

test("le webhook Systeme.io de Tipote garde SON taux", () => {
  // Il a toujours payé au taux `tiquiz`. Changer ça modifierait la
  // rémunération d'affiliés qui n'ont rien demandé.
  const src = lire("app/api/systeme-io/webhook/route.ts");
  assert.match(src, /produit: "tiquiz"/);
});

// ── 3. La base accepte la nouvelle valeur ──

test("la migration élargit la contrainte, sinon Postgres refuse la ligne", () => {
  const src = lire("supabase/migrations/20260826_affiliation_atelier.sql");
  assert.match(src, /affiliate_commissions/);
  assert.match(src, /check \(source_app in \('tipote', 'tiquiz', 'atelier'\)\)/);
  // Règle maison : toute migration recharge le schéma de PostgREST.
  assert.match(src, /notify pgrst, 'reload schema';/);
});

test("un remboursement Atelier peut annuler sa commission ici", () => {
  const route = lire("app/api/affiliate/cancel-sale/route.ts");
  assert.match(route, /body\.source_app === "atelier"/);
  const store = lire("lib/affiliate/annulationStore.ts");
  assert.match(store, /sourceApp: "tipote" \| "tiquiz" \| "atelier";/);
});

// ── 4. Le lien mène chez nous ──

test("le lien Atelier de l'espace affilié atterrit sur notre domaine", () => {
  const src = lire("lib/affiliate/linkDestinations.ts");
  assert.match(src, /slug: "atelier",\s+path: "https:\/\/atelierduquiz\.fr\/"/);
  // Et la raison du changement reste écrite : sans elle, le prochain qui
  // passe "restaure" l'ancien lien et casse à nouveau le paiement.
  assert.match(src, /ne payait donc plus personne|ne payait donc PLUS PERSONNE|ne payait \*\*plus personne\*\*/i);
});
