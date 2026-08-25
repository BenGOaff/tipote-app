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

// ── LES CINQ AVANTAGES DEMANDÉS LE 25 AOÛT 2026 ──────────────────────
//
// Béné : "sur Tiquiz je veux pouvoir proposer : un pourcentage sur le
// premier mois après le mois gratuit ; un pourcentage à vie ; un
// pourcentage ponctuel sur une durée précise (genre décembre à -40%) ;
// un pourcentage selon l'abonnement (mensuel, plus, annuel) ; deux mois
// gratis au lieu d'un."
//
// Cinq demandes, DEUX natures : une remise (avec une durée, et
// éventuellement un taux par palier) ou des jours offerts. La nature est
// une COLONNE, jamais une déduction sur les champs remplis.

test("un code écrit avant le 25 août vaut exactement ce qu'il valait", () => {
  // C'est la garantie de toujours : aucune ligne existante ne bouge.
  // Sans `kind` ni `duration`, c'est une remise sur la première échéance.
  const v = valider();
  assert.equal(v.ok, true);
  assert.deepEqual(v.ok === true && v.avantage, {
    type: "percent",
    percentOff: 20,
    duree: "once",
    mois: null,
  });
});

test("une remise À VIE et une remise sur N MOIS sortent telles quelles", () => {
  const aVie = valider({ code: code({ duration: "forever" }) });
  assert.equal(aVie.ok === true && aVie.avantage.type === "percent" && aVie.avantage.duree, "forever");

  // "Décembre à -40%" : une campagne, donc une remise sur une durée.
  const troisMois = valider({
    code: code({ percent_off: 40, duration: "months", duration_months: 3 }),
  });
  assert.deepEqual(troisMois.ok === true && troisMois.avantage, {
    type: "percent",
    percentOff: 40,
    duree: "months",
    mois: 3,
  });
});

test("une remise sur N mois SANS N n'est pas applicable", () => {
  // On ne choisit pas un N à la place de Béné : le code sort refusé,
  // avec sa raison, plutôt que d'inventer une durée.
  const v = valider({ code: code({ duration: "months", duration_months: null }) });
  assert.equal(v.ok === false && v.raison, "remise-illisible");
});

test("la remise peut dépendre du palier acheté", () => {
  const parPalier = code({
    percent_off: 10,
    percent_by_product: { monthly: 20, yearly: 30 },
  });
  // Le palier nommé gagne...
  const m = valider({ code: parPalier, produit: "monthly" });
  assert.equal(m.ok === true && m.avantage.type === "percent" && m.avantage.percentOff, 20);
  const y = valider({ code: parPalier, produit: "yearly" });
  assert.equal(y.ok === true && y.avantage.type === "percent" && y.avantage.percentOff, 30);
  // ...et un palier ABSENT de la table retombe sur la remise commune.
  // Sinon un nouveau produit au catalogue viderait le code de son effet
  // en silence, ce que personne ne verrait avant une réclamation.
  const p = valider({ code: parPalier, produit: "monthly_plus" });
  assert.equal(p.ok === true && p.avantage.type === "percent" && p.avantage.percentOff, 10);
});

test("des jours offerts ne sont PAS une remise", () => {
  // "Deux mois gratis au lieu d'un." Le verdict porte des jours, aucun
  // pourcentage : les deux ne s'appliquent pas au même endroit chez
  // Stripe comme chez PayPal, et un objet qui porterait les deux
  // laisserait un appelant lire le mauvais champ.
  const v = valider({ code: code({ kind: "free_days", free_days: 60 }) });
  assert.deepEqual(v.ok === true && v.avantage, { type: "free_days", jours: 60 });
});

test("la NATURE vient de la colonne, jamais des champs remplis", () => {
  // Une ligne qui porte les deux (parce que `percent_off` a un défaut en
  // base) doit rendre CE QUE LA COLONNE ANNONCE. Deviner marcherait tant
  // que personne ne saisit les deux, et casserait le jour où quelqu'un
  // le fait, sur un objet qui décide de ce qu'un client paie.
  const ambigu = code({ kind: "free_days", free_days: 60, percent_off: 20 });
  assert.equal(valider({ code: ambigu }).ok === true, true);
  const v = valider({ code: ambigu });
  assert.equal(v.ok === true && v.avantage.type, "free_days");

  const inverse = code({ kind: "percent", free_days: 60, percent_off: 20 });
  const w = valider({ code: inverse });
  assert.equal(w.ok === true && w.avantage.type, "percent");
});

test("des jours hors bornes ne s'appliquent pas", () => {
  // 365 est la borne de PayPal sur un cycle d'essai : au delà, c'est
  // leur API qui refuserait, avec un message que personne ne lit.
  for (const j of [0, -5, 366, 12.5, null]) {
    const v = valider({ code: code({ kind: "free_days", free_days: j as number }) });
    assert.equal(v.ok, false, `jours ${j} accepté`);
  }
});

test("une campagne n'ouvre pas avant sa date", () => {
  // "Décembre à -40%" : un code posé à l'avance ne doit pas s'ouvrir en
  // novembre à qui l'a vu passer trop tôt.
  const decembre = code({ starts_at: "2026-12-01T00:00:00Z" });
  const avant = valider({ code: decembre });
  assert.equal(avant.ok === false && avant.raison, "pas-encore");

  const pendant = validerCodeReduction({
    code: decembre,
    saDuLien: SA,
    produit: "monthly",
    maintenant: new Date("2026-12-10T12:00:00Z"),
  });
  assert.equal(pendant.ok, true);
});

test("une date de début illisible ferme le code", () => {
  const v = valider({ code: code({ starts_at: "bientot" }) });
  assert.equal(v.ok === false && v.raison, "pas-encore");
});

test("la migration des avantages tient ses garde-fous en base", () => {
  const sql = readFileSync(
    "supabase/migrations/20260825_avantages_affilies.sql",
    "utf8",
  );
  // Tout est ADDITIF et porte un défaut qui reproduit le comportement
  // d'avant.
  assert.match(sql, /add column if not exists kind text not null default 'percent'/i);
  assert.match(sql, /add column if not exists duration text not null default 'once'/i);
  // Une remise "sur N mois" sans N, ou des jours offerts sans jours, sont
  // refusés PAR LA BASE : le code n'est pas le seul rempart.
  assert.match(sql, /duration <> 'months' or \(duration_months is not null/i);
  assert.match(sql, /kind <> 'free_days' or \(free_days is not null/i);
  assert.match(sql, /notify pgrst/i);
});
