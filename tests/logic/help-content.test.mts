// tests/logic/help-content.test.mts
//
// L'AIDE EST COMPLÈTE DANS TOUTES LES LANGUES, ET SES RENVOIS EXISTENT.
//
// Béné, 6 août 2026 : "vérifier l'aide de chaque app et vérifier que tout
// est à jour, complet, formulé simplement pour aider."
//
// L'audit a trouvé exactement le genre de trou qu'aucun écran ne montre :
// un article annonçait "5 langues" alors que l'app en a 7, un autre
// vendait une offre à vie qui n'existe plus et oubliait les deux plans
// Plus qui, eux, existent. Rien ne rougissait, parce que rien ne
// regardait.
//
// Ce test ne juge pas la QUALITÉ du texte, personne ne sait le faire.
// Il tient les trois choses qui se cassent toutes seules :
//   - une langue oubliée sur un article ajouté à la va-vite ;
//   - un `related_slugs` qui pointe vers un article renommé ou supprimé,
//     donc un lien mort dans l'aide, ce qui est pire que pas de lien ;
//   - un article vide ou réduit à un renvoi vers une autre langue.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SEED_ARTICLES, SEED_CATEGORIES } from "../../lib/support/seedData.ts";

/** Les langues dans lesquelles l'aide est écrite. */
const LANGS = ["fr", "en", "es", "it", "ar"] as const;

/**
 * FR et EN sont les versions complètes ; ES, IT et AR sont condensées.
 * Le seuil bas n'est pas une tolérance à la paresse : il interdit le
 * placeholder ("voir la version française"), pas la concision.
 *
 * LE FRANÇAIS EST À 1000 CARACTÈRES MINIMUM, et ce seuil est le coeur
 * de la demande de Béné du 6 août : "ce support doit répondre à 95% des
 * questions, comme le bot, pour que j'ai le moins possible de tickets à
 * traiter". Un article de 600 caractères DÉCRIT une fonction sans dire
 * comment s'en servir : il ne déflèche aucun ticket, il en crée un. Les
 * 19 qui étaient en dessous ont été réécrits ; le seuil interdit de
 * recommencer.
 *
 * DETTE ASSUMÉE côté ES/IT/AR : une quarantaine d'articles Tipote s'y
 * réduisent à une ligne de chemin ("Créer > Vidéo → format → sujet →
 * Générer") là où le FR déroule les étapes. Béné a tranché le 6 août :
 * "pour le moment tipote multilangue c'est pas la priorité". Le seuil y
 * reste au plancher d'aujourd'hui : personne ne peut faire PIRE sans le
 * voir, et chaque article traduit fait monter le niveau réel sans
 * toucher au test.
 */
const MIN_CHARS: Record<string, number> = { fr: 1000, en: 200, es: 70, it: 70, ar: 60 };

test("chaque article existe dans les 5 langues, titre ET contenu", () => {
  for (const a of SEED_ARTICLES) {
    for (const lang of LANGS) {
      const titre = a.title[lang];
      const contenu = a.content[lang];
      assert.ok(titre && titre.trim().length > 0, `${a.slug} : titre ${lang} manquant`);
      assert.ok(contenu && contenu.trim().length > 0, `${a.slug} : contenu ${lang} manquant`);
      assert.ok(
        contenu.trim().length >= MIN_CHARS[lang],
        `${a.slug} : contenu ${lang} trop court (${contenu.trim().length} caractères), ` +
          "c'est un placeholder, pas un article",
      );
    }
  }
});

test("aucun article ne renvoie le lecteur vers une autre langue", () => {
  // "Voir la version anglaise" est la façon polie de ne pas traduire.
  // Une cliente italienne qui lit ça a compris qu'on l'avait oubliée.
  const AVEUX = [
    /version fran[çc]aise/i,
    /see the (english|french) version/i,
    /versi[óo]n (inglesa|francesa)/i,
    /versione (inglese|francese)/i,
    /coming soon/i,
    // Sensible à la casse, et borné : "todo" est un mot espagnol
    // parfaitement ordinaire ("tout"), et il vit dans plusieurs articles.
    /\bTODO\b/,
    /lorem ipsum/i,
  ];
  for (const a of SEED_ARTICLES) {
    for (const lang of LANGS) {
      for (const rx of AVEUX) {
        assert.ok(
          !rx.test(a.content[lang] ?? ""),
          `${a.slug} (${lang}) contient un renvoi ou un placeholder : ${rx}`,
        );
      }
    }
  }
});

test("chaque article lié existe vraiment", () => {
  const connus = new Set(SEED_ARTICLES.map((a) => a.slug));
  for (const a of SEED_ARTICLES) {
    for (const rel of a.related_slugs ?? []) {
      assert.ok(connus.has(rel), `${a.slug} renvoie vers "${rel}", qui n'existe pas`);
      assert.notEqual(rel, a.slug, `${a.slug} se renvoie à lui-même`);
    }
  }
});

test("chaque article appartient à une catégorie déclarée", () => {
  const cats = new Set(SEED_CATEGORIES.map((c) => c.slug));
  for (const a of SEED_ARTICLES) {
    assert.ok(cats.has(a.category_slug), `${a.slug} : catégorie "${a.category_slug}" inconnue`);
  }
});

test("aucune catégorie vide", () => {
  // Une catégorie sans article est une porte qui ouvre sur un mur.
  for (const c of SEED_CATEGORIES) {
    const n = SEED_ARTICLES.filter((a) => a.category_slug === c.slug).length;
    assert.ok(n > 0, `la catégorie "${c.slug}" n'a aucun article`);
  }
});

test("les slugs sont uniques", () => {
  // L'upsert se fait sur le slug : deux articles homonymes, et le second
  // écrase silencieusement le premier en base.
  const vus = new Set<string>();
  for (const a of SEED_ARTICLES) {
    assert.ok(!vus.has(a.slug), `slug en double : ${a.slug}`);
    vus.add(a.slug);
  }
});

test("l'aide ne cite pas d'offre qui n'est plus vendue comme si elle l'était", () => {
  // L'offre à vie à 57 € a été arrêtée, et l'article des plans continuait
  // à la présenter dans son tableau de tarifs, entre le gratuit et le
  // mensuel. Quelqu'un a forcément essayé de l'acheter.
  const plans = SEED_ARTICLES.find((a) => a.slug === "tiquiz-plans");
  assert.ok(plans, "l'article tiquiz-plans a disparu");
  for (const lang of LANGS) {
    const c = plans.content[lang] ?? "";
    if (!/57/.test(c)) continue;
    assert.match(
      c,
      /n'est plus vendue|no longer sold|ya no se vende|non è più in vendita|لم يعد معروضًا/,
      `${lang} : l'offre à vie est citée sans dire qu'elle est arrêtée`,
    );
  }
});

test("la catégorie Tiquiz est servie dans les 5 langues, pour de vrai", () => {
  // C'est la SEULE aide qu'ait un client Tiquiz : le bouton "Aide" de
  // l'app pointe ici. Une version espagnole réduite à une ligne y coûte
  // beaucoup plus cher qu'ailleurs, parce qu'il n'y a rien d'autre à lire.
  const tiquiz = SEED_ARTICLES.filter((a) => a.category_slug === "tiquiz");
  assert.ok(tiquiz.length >= 13, `seulement ${tiquiz.length} articles Tiquiz`);

  const PLANCHER: Record<string, number> = { fr: 600, en: 500, es: 200, it: 200, ar: 180 };
  for (const a of tiquiz) {
    for (const [lang, min] of Object.entries(PLANCHER)) {
      const n = (a.content[lang] ?? "").trim().length;
      assert.ok(n >= min, `${a.slug} (${lang}) : ${n} caractères, il en faut au moins ${min}`);
    }
  }
});

test("l'aide Tiquiz couvre ce que l'app sait faire", () => {
  // L'audit du 6 août : l'aide s'était arrêtée à la version de mai. Elle
  // ne disait rien des sondages, du popquiz, des statistiques, du domaine
  // personnalisé ni du choix profil/score, qui sont pourtant les sujets
  // qui font écrire au support. Une fonctionnalité sans article est une
  // fonctionnalité que personne ne trouve.
  const slugs = new Set(
    SEED_ARTICLES.filter((a) => a.category_slug === "tiquiz").map((a) => a.slug),
  );
  for (const attendu of [
    "tiquiz-profil-ou-score",
    "tiquiz-stats",
    "tiquiz-page-resultat",
    "tiquiz-mise-en-page",
    "tiquiz-sondages",
    "tiquiz-popquiz",
    "tiquiz-domaine",
  ]) {
    assert.ok(slugs.has(attendu), `l'article "${attendu}" a disparu de l'aide Tiquiz`);
  }
});
