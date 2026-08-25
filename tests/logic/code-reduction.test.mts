// tests/logic/code-reduction.test.mts
//
// Béné, 25 août 2026 : "Codes de réduction : à prévoir pour que j'en
// attribue un à un affilié si besoin. Ne sera valable que sur le lien de
// l'affilié."
//
// Cette deuxième phrase est ce qui rend le code SÛR, et c'est elle que
// ce fichier surveille en premier. Un code de réduction finit toujours
// par sortir de la main de celui à qui on l'a donné (site de bons plans,
// groupe Facebook, commentaire YouTube) : lié au lien de son affilié, il
// n'a aucune valeur pour qui n'est pas passé par ce lien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REMISE_MAX_PCT,
  normaliserCode,
  prixRemiseCents,
  remiseValide,
  validerCodeReduction,
  type CodeReductionRow,
} from "../../lib/affiliate/codeReduction.ts";

const MAINTENANT = new Date("2026-08-25T12:00:00Z");
const SA = "sa0007878317200141bbe3de2b6644176621db2c6580";
const AUTRE_SA = "sa00099999abcdef0123456789abcdef0123456789";

function code(over: Partial<CodeReductionRow> = {}): CodeReductionRow {
  return { code: "JOCELYNE20", sa: SA, percent_off: 20, enabled: true, ...over };
}

const valider = (over: Partial<Parameters<typeof validerCodeReduction>[0]> = {}) =>
  validerCodeReduction({
    code: code(),
    saDuLien: SA,
    produit: "monthly",
    maintenant: MAINTENANT,
    ...over,
  });

// ── LA RÈGLE DE BÉNÉ ─────────────────────────────────────────────────

test("le code ne marche QUE sur le lien de son affilié", () => {
  assert.equal(valider().ok, true);

  // Le lien de quelqu'un d'autre : refusé.
  const autre = valider({ saDuLien: AUTRE_SA });
  assert.equal(autre.ok, false);
  assert.equal(autre.ok === false && autre.raison, "mauvais-lien");

  // Aucun lien du tout (le code a fuité sur un site de bons plans) :
  // refusé aussi. C'est exactement ce qui empêche le code de raboter
  // une vente qu'on aurait faite au prix plein.
  const sansLien = valider({ saDuLien: null });
  assert.equal(sansLien.ok, false);
  assert.equal(sansLien.ok === false && sansLien.raison, "mauvais-lien");
});

test("la raison distingue le mauvais lien du code inconnu", () => {
  // "Ce code ne marche que sur le lien de la personne qui te l'a donné"
  // est une phrase qui explique. "Code invalide" envoie chercher une
  // faute de frappe qui n'existe pas.
  const inconnu = valider({ code: null });
  assert.equal(inconnu.ok === false && inconnu.raison, "inconnu");
});

// ── Les bornes ───────────────────────────────────────────────────────

test("un code désactivé ou expiré ne s'applique pas", () => {
  const off = valider({ code: code({ enabled: false }) });
  assert.equal(off.ok === false && off.raison, "desactive");

  const fini = valider({ code: code({ expires_at: "2026-08-24T23:59:00Z" }) });
  assert.equal(fini.ok === false && fini.raison, "expire");

  // Une date encore valable laisse passer.
  assert.equal(valider({ code: code({ expires_at: "2026-12-31T23:59:00Z" }) }).ok, true);
});

test("une date de fin ILLISIBLE ferme le code", () => {
  // Une valeur qu'on ne sait pas lire est un doute, et un doute sur de
  // l'argent se tranche en faveur du prix plein.
  const bancal = valider({ code: code({ expires_at: "la semaine prochaine" }) });
  assert.equal(bancal.ok === false && bancal.raison, "expire");
});

test("la liste de produits, quand elle existe, est respectée", () => {
  assert.equal(valider({ code: code({ produits: ["yearly"] }) }).ok, false);
  assert.equal(valider({ code: code({ produits: ["monthly", "yearly"] }) }).ok, true);
  // Vide ou absent = tous les produits.
  assert.equal(valider({ code: code({ produits: [] }) }).ok, true);
  assert.equal(valider({ code: code({ produits: null }) }).ok, true);
});

test("une remise hors bornes ne s'applique pas", () => {
  // "Gratuit" n'est pas une remise : un accès offert se pose depuis
  // l'admin, où il est tracé comme tel, au lieu de fabriquer un
  // abonnement à zéro euro qu'aucun écran ne distingue d'un vrai client.
  for (const pct of [0, -5, 100, 91, 20.5]) {
    const v = valider({ code: code({ percent_off: pct }) });
    assert.equal(v.ok, false, `pct ${pct} accepté`);
    assert.equal(v.ok === false && v.raison, "remise-illisible");
  }
  assert.equal(remiseValide(REMISE_MAX_PCT), true);
  assert.equal(remiseValide(REMISE_MAX_PCT + 1), false);
});

// ── La saisie ────────────────────────────────────────────────────────

test("le code saisi est nettoyé, pas jugé", () => {
  // NORMALISER N'EST PAS VALIDER (leçon du BIC, 25 août) : un code
  // refusé pour une majuscule est une vente perdue sur un détail que
  // personne ne voit.
  assert.equal(normaliserCode("  jocelyne20 "), "JOCELYNE20");
  assert.equal(normaliserCode("JOCE LYNE 20"), "JOCELYNE20");
  // Les accents se translittèrent : "ÉTÉ20" ne doit pas devenir "T20",
  // un code muet qui pourrait tomber sur celui de quelqu'un d'autre.
  assert.equal(normaliserCode("été-20"), "ETE-20");
  assert.equal(normaliserCode("Noël"), "NOEL");
  assert.equal(normaliserCode(null), "");
  assert.equal(normaliserCode("A".repeat(60)).length, 40);
});

test("le prix remisé ne tombe jamais à zéro", () => {
  assert.equal(prixRemiseCents(1700, 20), 1360);
  assert.equal(prixRemiseCents(10, 90), 1);
  assert.equal(prixRemiseCents(1700, 0), 1700);
});

// ── La table ─────────────────────────────────────────────────────────

test("la migration existe, et le code appartient à une affiliée", () => {
  const sql = readFileSync(
    "supabase/migrations/20260825_codes_reduction_affilies.sql",
    "utf8",
  );
  assert.match(sql, /create table if not exists affiliate_discount_codes/i);
  // Sans la clé étrangère, un code pourrait survivre à l'affiliée qui
  // le porte, et ne s'ouvrir sur le lien de personne.
  assert.match(sql, /references affiliates\(sa\)/i);
  assert.match(sql, /percent_off int not null check \(percent_off between 1 and 90\)/i);
  assert.match(sql, /notify pgrst/i);
});

test("la porte interne ne rend QUE ce qu'il faut pour décider", () => {
  // Un point d'entrée interne qui rend plus que nécessaire finit par
  // être appelé pour autre chose.
  const src = readFileSync("app/api/affiliate/code-reduction/route.ts", "utf8");
  assert.match(src, /timingSafeEqual/, "comparaison de secret naïve");
  assert.ok(!/email/i.test(src.split("return NextResponse.json({\n    ok: true,\n    valide: true")[1] ?? ""),
    "la réponse rend une donnée personnelle");
  // "Je n'ai pas pu regarder" et "il n'y a rien" n'appellent pas la
  // même suite : confondre les deux ferait payer le prix plein à
  // quelqu'un qui a un code valide.
  assert.match(src, /reason: "read_failed"/);
});
