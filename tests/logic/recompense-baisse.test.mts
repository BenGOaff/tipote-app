// tests/logic/recompense-baisse.test.mts
//
// Béné, 26 août 2026, sur le dernier trou de la mécanique de
// récompense : "oui il faut le faire."
//
// Le trou : rien ne prévenait un affilié quand sa remise BAISSE. Un
// filleul arrête de payer, la remise passe de 20 % à 10 %, et son
// prélèvement du mois suivant augmente sans qu'il l'ait su. Il le
// découvre sur son relevé, et de son point de vue c'est nous qui avons
// changé son prix en douce.
//
// C'est le silence que le `ok: false` du 3 août interdit, transposé à de
// l'argent qui sort de chez quelqu'un d'autre. Et c'est la seule raison
// d'être du recalcul MENSUEL : annoncer avant d'appliquer. Sans
// l'annonce, le calcul mensuel ne servait plus à rien.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  changementRecompense,
  recompenseDuMois,
  COMMISSION_BASE_PCT,
} from "@/lib/affiliate/recompense";
import {
  emailRecompense,
  langueAffilie,
  URL_ESPACE_AFFILIE,
} from "@/lib/affiliate/recompenseEmail";

// ── LE SENS ──────────────────────────────────────────────────────────

test("une remise qui descend est une BAISSE, meme si le nombre monte", () => {
  // Le piège du signe : la remise descend de 20 à 10, donc le PRIX monte.
  // C'est bien une baisse de récompense, et c'est ce qui coûte.
  const apres = recompenseDuMois("abonnement", 10);
  const c = changementRecompense("abonnement", { remisePct: 20, filleuls: 21 }, apres);
  assert.equal(c.sens, "baisse");
  assert.equal(c.avantPct, 20);
  assert.equal(c.apresPct, 10);
});

test("la mecanique est un PARAMETRE, jamais devinee", () => {
  // Le même affilié, les mêmes colonnes, deux lectures opposées selon
  // son choix. Deviner laquelle regarder marcherait jusqu'au premier qui
  // bascule d'une récompense à l'autre.
  const avant = { remisePct: 30, commissionPct: 55, filleuls: 30 };
  const apres = recompenseDuMois("commissions", 30);
  const surCom = changementRecompense("commissions", avant, apres);
  assert.equal(surCom.quoi, "commissions");
  assert.equal(surCom.avantPct, 55);
});

test("une hausse et un statu quo ne declenchent rien", () => {
  const monte = changementRecompense(
    "abonnement",
    { remisePct: 10, filleuls: 10 },
    recompenseDuMois("abonnement", 25),
  );
  assert.equal(monte.sens, "hausse");
  assert.equal(emailRecompense(monte, { nom: "Jocelyne", locale: "fr" }), null);

  const stable = changementRecompense(
    "abonnement",
    { remisePct: 20, filleuls: 22 },
    recompenseDuMois("abonnement", 21),
  );
  assert.equal(stable.sens, "stable");
  assert.equal(emailRecompense(stable, { nom: "Jocelyne", locale: "fr" }), null);
});

test("une ligne jamais calculee DEMARRE, elle ne baisse pas", () => {
  // Les colonnes sont NULL avant le premier passage du cron. Les lire
  // comme zéro enverrait un email de baisse à quelqu'un qui vient
  // d'arriver, sur un taux qu'il n'a jamais eu.
  const c = changementRecompense(
    "commissions",
    { remisePct: null, commissionPct: null, filleuls: null },
    recompenseDuMois("commissions", 0),
  );
  assert.equal(c.avantPct, COMMISSION_BASE_PCT);
  assert.equal(c.sens, "stable");
  assert.equal(emailRecompense(c, { nom: "Nouveau", locale: "fr" }), null);
});

// ── LE MESSAGE ───────────────────────────────────────────────────────

test("l'email dit le AVANT, le APRES, et surtout POURQUOI", () => {
  const c = changementRecompense(
    "abonnement",
    { remisePct: 20, filleuls: 21 },
    recompenseDuMois("abonnement", 10),
  );
  const m = emailRecompense(c, { nom: "Jocelyne", locale: "fr" });
  assert.ok(m);
  assert.match(m.greeting, /Jocelyne/);
  assert.match(m.body, /-20 %/);
  assert.match(m.body, /-10 %/);
  // La CAUSE, sans laquelle le chiffre se lit comme une sanction et
  // n'offre aucun levier (même règle que le funnel de Jocelyne).
  assert.match(m.body, /21/);
  assert.match(m.body, /10/);
  assert.equal(m.ctaUrl, URL_ESPACE_AFFILIE);
});

test("on ne promet AUCUNE date", () => {
  // Le recalcul tourne le 2, l'application le 3, mais l'échéance de
  // chacun tombe le jour de SON abonnement. Annoncer une date serait
  // faux pour presque tout le monde.
  for (const locale of ["fr", "en", "es", "it", "pt", "ar"]) {
    const c = changementRecompense(
      "abonnement",
      { remisePct: 30, filleuls: 31 },
      recompenseDuMois("abonnement", 10),
    );
    const m = emailRecompense(c, { nom: "X", locale });
    assert.ok(m, locale);
    assert.doesNotMatch(m.body, /\b(le 3|le 2|3rd|2nd)\b/, locale);
  }
});

test("les 6 langues repondent, et aucune ne laisse un trou", () => {
  for (const locale of ["fr", "en", "es", "it", "pt", "ar"]) {
    for (const choix of ["abonnement", "commissions"] as const) {
      const c = changementRecompense(
        choix,
        { remisePct: 40, commissionPct: 60, filleuls: 41 },
        recompenseDuMois(choix, 10),
      );
      const m = emailRecompense(c, { nom: "Éric", locale });
      assert.ok(m, `${locale}/${choix}`);
      for (const champ of [m.subject, m.greeting, m.body, m.ctaLabel]) {
        assert.ok(champ.trim().length > 0, `${locale}/${choix} : champ vide`);
        // Un gabarit non rempli est le bug qui ne se voit qu'en prod.
        assert.doesNotMatch(champ, /\$\{|undefined|NaN/, `${locale}/${choix}`);
      }
    }
  }
});

test("une locale inconnue lit le francais, elle ne casse pas", () => {
  assert.equal(langueAffilie("de"), "fr");
  assert.equal(langueAffilie(null), "fr");
  assert.equal(langueAffilie("PT-br"), "pt");
  const c = changementRecompense(
    "abonnement",
    { remisePct: 20, filleuls: 21 },
    recompenseDuMois("abonnement", 10),
  );
  assert.ok(emailRecompense(c, { nom: "X", locale: "klingon" }));
});

test("sans prenom, la salutation reste propre", () => {
  const c = changementRecompense(
    "abonnement",
    { remisePct: 20, filleuls: 21 },
    recompenseDuMois("abonnement", 10),
  );
  const m = emailRecompense(c, { nom: null, locale: "fr" });
  assert.ok(m);
  // Ni double espace, ni virgule orpheline : "Salut  👋" se resserre.
  assert.doesNotMatch(m.greeting, /\s{2,}/);
  assert.doesNotMatch(m.greeting, /^\s|,\s*👋/);
});

test("le message ne s'adresse jamais a une femme en particulier", () => {
  // On ne vend pas qu'a des femmes (Béné, 23 et 24 août).
  const c = changementRecompense(
    "abonnement",
    { remisePct: 20, filleuls: 21 },
    recompenseDuMois("abonnement", 10),
  );
  for (const locale of ["fr", "en", "es", "it", "pt", "ar"]) {
    const m = emailRecompense(c, { nom: "X", locale });
    assert.ok(m);
    assert.doesNotMatch(m.body, /\b(inscrite|connectée|prête|sûre)\b/, locale);
  }
});
