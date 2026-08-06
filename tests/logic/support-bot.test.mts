// tests/logic/support-bot.test.mts
//
// LE BOT D'AIDE CONNAÎT VRAIMENT LES DEUX APPS.
//
// Béné, 6 août 2026 : "que le bot de l'aide sache exactement quoi
// répondre parce qu'il connaît par coeur le code de chaque app, où
// trouver, quoi répondre, comment guider."
//
// -- LE DÉFAUT QU'ON EMPÊCHE DE REVENIR --------------------------------
//
// `buildSupportKnowledgeBase()` injectait la LISTE DES TITRES des
// articles et pas une ligne de leur contenu. Le bot avait donc un
// sommaire et aucun texte, avec l'ordre formel de ne rien inventer : il
// ne POUVAIT pas répondre précisément. Et rien ne le montrait, parce
// qu'un prompt ne plante jamais, il répond juste moins bien.
//
// Un test qui compte les caractères du prompt n'aurait rien vu non plus
// (un sommaire de 57 titres, c'est déjà 2 000 caractères). Ce test
// vérifie donc que des PHRASES précises des articles sont bien là.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSupportKnowledgeBase } from "../../lib/support/knowledgeBase.ts";
import { SEED_ARTICLES } from "../../lib/support/seedData.ts";

const KB = buildSupportKnowledgeBase("fr");

test("le bot a le TEXTE de chaque article, pas seulement son titre", () => {
  // On prend une phrase du milieu de chaque article : un titre présent
  // ne prouve rien, c'est exactement ce qu'il y avait avant.
  for (const a of SEED_ARTICLES) {
    const texte = (a.content.fr ?? "").trim();
    assert.ok(texte.length > 0, `${a.slug} : pas de contenu FR`);

    const lignes = texte
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 60 && !l.startsWith("#") && !l.startsWith("|"));
    assert.ok(lignes.length > 0, `${a.slug} : aucune ligne assez longue pour être testée`);

    const milieu = lignes[Math.floor(lignes.length / 2)];
    assert.ok(
      KB.includes(milieu),
      `${a.slug} : le bot n'a pas le contenu de cet article (phrase absente : "${milieu.slice(0, 70)}...")`,
    );
  }
});

test("chaque article est donné avec son adresse, pour que le bot puisse y renvoyer", () => {
  // Sans l'adresse, le bot recopie l'article entier dans le chat ou
  // invente une URL. Les deux sont mauvais.
  for (const a of SEED_ARTICLES) {
    assert.ok(
      KB.includes(`/support/article/${a.slug}`),
      `${a.slug} : son adresse n'est pas dans la base de connaissances`,
    );
  }
});

test("le bot sait qu'il y a DEUX apps, et ne confond pas leurs domaines", () => {
  assert.match(KB, /DEUX applications/i);
  assert.ok(KB.includes("https://quiz.tipote.com"), "le domaine de Tiquiz manque");
  assert.ok(KB.includes("https://app.tipote.com"), "le domaine de Tipote manque");
  // Les erreurs d'URL de juin 2026 : ces adresses n'existent pas.
  assert.ok(!KB.includes("tipote.fr/tiquiz/api"), "adresse inventée dans la base");
  assert.ok(!KB.includes("formaquiz.tipote.com"), "hostname mort depuis le rebrand de juin");
});

test("le bot connaît l'emplacement exact des écrans de Tiquiz", () => {
  // "où ça se trouve ?" est LA question du support. Un bot qui répond
  // "dans les réglages" ne sert à rien.
  for (const repere of [
    "Paramètres > Compte & Tarifs",
    "Paramètres > Domaine",
    "Mes projets",
    "Popquiz vidéo",
  ]) {
    assert.ok(KB.includes(repere), `le bot ne connaît pas le repère "${repere}"`);
  }
});

test("le bot connaît les pièges qui font écrire au support", () => {
  const pieges: [string, RegExp][] = [
    ["quiz en 404 parce qu'il est en brouillon", /404[\s\S]{0,400}brouillon|brouillon[\s\S]{0,400}404/i],
    ["l'alerte « jamais attribué » en mode profil", /ne peut jamais être attribué/i],
    ["le funnel qui désigne la question précédente", /n'a jamais vu la 7/i],
    ["le seuil d'échantillon du funnel", /vingtaine/i],
    ["perdre du monde est normal", /NORMAL et SAIN|normal et sain/i],
    ["l'alignement à trois étages", /Tout réaligner sur ce réglage/],
    ["le tag Systeme.io déjà posé au test", /redéclenche pas/i],
    ["l'offre à vie arrêtée", /n'est plus vendue|plus vendu/i],
  ];
  for (const [nom, rx] of pieges) {
    assert.match(KB, rx, `le bot ne sait pas répondre sur : ${nom}`);
  }
});

test("le bot ne porte aucune information périmée", () => {
  // Le prix a changé le 6 août. Une base de connaissances qui garde
  // l'ancien prix est pire qu'une base vide : elle est confiante.
  assert.ok(KB.includes("17 €/mois"), "le prix Tiquiz à jour manque");
  assert.ok(!/\b9\s?€\/mois/.test(KB), "l'ancien prix Tiquiz (9 €/mois) traîne encore");
  assert.ok(!/\b90\s?€\/an/.test(KB), "l'ancien prix annuel (90 €/an) traîne encore");
  assert.ok(!/(disponible|available) en 5 langues/i.test(KB), "le compte de langues est périmé");
  // L'offre à vie : citée, mais jamais comme achetable.
  if (KB.includes("57")) {
    assert.match(KB, /n'est plus vendue/, "l'offre à vie est citée sans dire qu'elle est arrêtée");
  }
});

test("le prompt est identique quelle que soit la langue, sinon le cache saute", () => {
  // Le corpus est en français pour tout le monde (les versions ES/IT/AR
  // sont condensées : les donner au bot le priverait des trois quarts de
  // ce qu'on sait). Corollaire : le prompt ne varie pas, donc le cache
  // de prompt d'OpenAI le sert à 0,1x. Insérer quoi que ce soit de
  // variable ici le ferait sauter pour TOUT LE MONDE.
  for (const l of ["en", "es", "it", "ar", undefined]) {
    assert.equal(buildSupportKnowledgeBase(l), KB, `la base change pour la locale ${l}`);
  }
});

test("la base reste assez grosse pour être mise en cache", () => {
  // Le cache de prompt d'OpenAI ne s'active qu'au delà de 1024 tokens.
  // On est très largement au dessus, mais un futur allègement qui
  // passerait sous la barre coûterait le plein tarif à chaque message.
  assert.ok(KB.length > 40_000, `base trop courte : ${KB.length} caractères`);
});

test("le bot ne peut pas rendre une bulle vide, ni abandonner au premier essai", () => {
  // Béné, en testant : "j'ai teste de poser une question simple au bot
  // et... 502". Le 502 etait le garde-fou ; la cause etait au dessus.
  //
  // Sur un modele a raisonnement, `max_completion_tokens` couvre le
  // RAISONNEMENT et la reponse. En passant la base de connaissances de
  // 6 000 a 27 000 tokens, le raisonnement s'est allonge au point de
  // manger tout le budget : `content` revenait vide.
  const route = readFileSync(
    join(process.cwd(), "app/api/support/chat/route.ts"),
    "utf8",
  );

  const budgets = [...route.matchAll(/budget:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(budgets.length >= 2, "il faut au moins deux tentatives");
  assert.ok(
    Math.min(...budgets) >= 3000,
    `budget de ${Math.min(...budgets)} tokens : trop juste, le raisonnement mange la réponse`,
  );

  // La 2e tentative doit agir sur la CAUSE, pas seulement rallonger :
  // rejouer la meme requete apres un echec du a la longueur du
  // raisonnement echouerait a l'identique.
  assert.match(route, /effort:\s*"minimal"/, "aucune tentative ne réduit le raisonnement");

  // Une tentative qui leve ne doit pas emporter la suivante : le catch
  // doit vivre DANS la boucle, pas autour.
  const boucle = route.slice(route.indexOf("for (const { budget, effort }"));
  assert.ok(
    boucle.slice(0, boucle.indexOf("return \"\";")).includes("} catch"),
    "la boucle de retry n'est pas protégée : une tentative qui lève emporte la suivante",
  );

  // Et une reponse vide doit produire une erreur, jamais un ok: true.
  assert.match(route, /if \(!reply\)/, "une réponse vide passerait en ok: true");

  // On journalise de quoi diagnostiquer sans deviner.
  assert.match(route, /finish_reason/, "finish_reason n'est pas journalisé");
  assert.match(route, /reasoning_tokens/, "les tokens de raisonnement ne sont pas journalisés");
});
