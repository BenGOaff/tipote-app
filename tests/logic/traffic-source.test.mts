// tests/logic/traffic-source.test.mts
//
// Audit du quiz de Jocelyne, 4 août 2026. On a fini par établir que sa
// fuite était l'écran d'accueil, et on s'est arrêtés là, faute de
// pouvoir répondre à la suite :
//
//     est-ce que sa page déçoit, ou est-ce que le monde qui arrive
//     dessus n'est pas le bon ?
//
// Les deux donnent le même chiffre et appellent des corrections
// opposées. Ce fichier fige ce qu'on enregistre, ce qu'on refuse
// d'enregistrer, et surtout ce qu'on s'interdit de conclure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  classifyTraffic,
  readTrafficSource,
  renderTrafficForPrompt,
  sanitizeVisitMeta,
  summarizeTraffic,
  type VisitMeta,
} from "../../lib/quiz/trafficSource.ts";

const many = (source: string, n: number): VisitMeta[] =>
  Array.from({ length: n }, () => ({ source }));

// ── Classer une visite ───────────────────────────────────────────────

test("un partage Instagram est reconnu", () => {
  const m = classifyTraffic({
    referrer: "https://l.instagram.com/?u=truc",
    url: "https://quiz.tipote.com/mon-quiz",
    selfHost: "quiz.tipote.com",
  });
  assert.equal(m.source, "instagram");
});

test("l'étiquette posée par la créatrice gagne sur le referrer", () => {
  // Elle sait mieux que nous d'où part SON lien, et c'est la seule
  // façon de distinguer deux publications sur le même réseau.
  const m = classifyTraffic({
    referrer: "https://www.facebook.com/",
    url: "https://quiz.tipote.com/mon-quiz?utm_source=newsletter-mars&utm_medium=email",
    selfHost: "quiz.tipote.com",
  });
  assert.equal(m.source, "newsletter-mars");
  assert.equal(m.utm_medium, "email");
});

test("un site inconnu garde son nom", () => {
  // Un forum de niche ou le site d'une partenaire vaut largement une
  // ligne : c'est souvent le meilleur trafic d'une créatrice.
  const m = classifyTraffic({
    referrer: "https://www.forum-tdah-parents.fr/sujet/123",
    url: "https://quiz.tipote.com/mon-quiz",
    selfHost: "quiz.tipote.com",
  });
  assert.equal(m.source, "forum-tdah-parents.fr");
});

test("une navigation interne n'est pas une provenance", () => {
  const m = classifyTraffic({
    referrer: "https://quiz.tipote.com/autre-page",
    url: "https://quiz.tipote.com/mon-quiz",
    selfHost: "quiz.tipote.com",
  });
  assert.equal(m.source, "direct");
});

test("sans referrer, c'est direct", () => {
  // Et "direct" ne veut PAS dire "ils ont tapé l'adresse" : les
  // applications mobiles n'envoient pas de referrer. Le libellé et les
  // prompts doivent le dire, c'est testé plus bas.
  const m = classifyTraffic({ referrer: "", url: "https://quiz.tipote.com/x", selfHost: "quiz.tipote.com" });
  assert.equal(m.source, "direct");
});

// ── Ce qu'on refuse d'enregistrer ────────────────────────────────────

test("on ne garde jamais le chemin ni la query du referrer", () => {
  // Un referrer complet peut porter un groupe privé, une conversation,
  // une recherche nominative. On n'en a pas besoin.
  const m = classifyTraffic({
    referrer: "https://www.facebook.com/groups/parents-tdah-secret/posts/998877?comment_id=42",
    url: "https://quiz.tipote.com/mon-quiz",
    selfHost: "quiz.tipote.com",
  });
  assert.equal(m.source, "facebook");
  assert.ok(!JSON.stringify(m).includes("secret"));
  assert.ok(!JSON.stringify(m).includes("998877"));
});

test("le serveur ne garde que les clés connues, nettoyées et bornées", () => {
  // Le viewer tourne chez le visiteur : tout ce qu'il envoie est
  // modifiable.
  const clean = sanitizeVisitMeta({
    source: "  INSTAGRAM  ",
    utm_campaign: "<script>alert(1)</script>",
    email: "jocelyne@example.com",
    payload: { evil: true },
  });
  assert.equal(clean?.source, "instagram");
  assert.ok(!("email" in (clean ?? {})), "aucune clé hors liste blanche");
  assert.ok(!("payload" in (clean ?? {})));
  assert.ok(!/[<>()]/.test(clean?.utm_campaign ?? ""), "pas de balise conservée");
});

test("une valeur démesurée est coupée", () => {
  const clean = sanitizeVisitMeta({ source: "a".repeat(500) });
  assert.ok((clean?.source?.length ?? 0) <= 60);
});

test("rien d'exploitable rend null, pas un objet vide", () => {
  // Une ligne meta = {} ressemble à une donnée alors qu'elle n'en est
  // pas une.
  assert.equal(sanitizeVisitMeta({ hop: 1 }), null);
  assert.equal(sanitizeVisitMeta(null), null);
  assert.equal(sanitizeVisitMeta("instagram"), null);
  assert.equal(sanitizeVisitMeta([{ source: "x" }]), null);
});

// ── Ce qu'on a le droit de conclure ──────────────────────────────────

test("sur une poignée de visites, on ne conclut rien", () => {
  // Exactement le défaut du funnel : un verdict sur trois personnes.
  const reading = readTrafficSource(many("instagram", 8));
  assert.equal(reading.kind, "too-few");
});

test("un trafic qui vient d'un seul endroit est nommé comme tel", () => {
  const reading = readTrafficSource([...many("instagram", 40), ...many("google", 3)]);
  assert.equal(reading.kind, "single");
  assert.equal(reading.kind === "single" && reading.top.source, "instagram");
});

test("plusieurs sources : on peut comparer", () => {
  const reading = readTrafficSource([
    ...many("instagram", 30),
    ...many("facebook", 20),
    ...many("google", 10),
  ]);
  assert.equal(reading.kind, "mixed");
  assert.equal(reading.kind === "mixed" && reading.top.source, "instagram");
});

test("la part de direct est rendue à part, parce qu'elle aveugle", () => {
  // Sur les réseaux mobiles, la plupart des visites arrivent sans
  // referrer. Un gros "direct" est le cas NORMAL, pas un mystère.
  const reading = readTrafficSource([...many("direct", 45), ...many("instagram", 10)]);
  assert.ok(reading.kind === "single" || reading.kind === "mixed");
  if (reading.kind === "single" || reading.kind === "mixed") {
    assert.ok(reading.directShare > 70);
  }
});

test("un quiz sans provenance tracée ne raconte rien", () => {
  assert.deepEqual(readTrafficSource([]), { kind: "no-data" });
  assert.deepEqual(readTrafficSource([null, undefined, {}]), { kind: "no-data" });
});

// ── Les comptes ──────────────────────────────────────────────────────

test("les pourcentages somment à 100 sur les visites classées", () => {
  const slices = summarizeTraffic([...many("instagram", 3), ...many("google", 1), null]);
  const total = slices.reduce((n, s) => n + s.pct, 0);
  assert.ok(Math.abs(total - 100) < 0.2, `somme ${total}`);
  assert.equal(slices[0]!.count, 3, "trié par volume décroissant");
});

// ── Ce que nos IA reçoivent ──────────────────────────────────────────
//
// C'est le vrai enjeu du module. Un modèle à qui on dit "la moitié
// repart de l'écran d'accueil" propose de réécrire la promesse, parce
// que c'est le seul levier qu'on lui a donné. Si le trafic vient d'un
// partage hors sujet, cette réécriture ne peut rien produire, et la
// créatrice conclura que nos conseils ne servent à rien. Elle aura
// raison.

test("sans provenance, l'IA n'a pas le droit d'en inventer une", () => {
  const p = renderTrafficForPrompt({ kind: "no-data" });
  assert.match(p, /INTERDIT d'affirmer d'ou vient son trafic/);
  assert.match(p, /les DEUX causes possibles/);
});

test("sur une poignée de visites, elle ne commente pas la répartition", () => {
  const p = renderTrafficForPrompt(readTrafficSource(many("instagram", 6)));
  assert.match(p, /INTERDIT de commenter la repartition/);
});

test("un trafic à source unique se lit CONTRE ce public là", () => {
  const p = renderTrafficForPrompt(
    readTrafficSource([...many("instagram", 50), ...many("google", 2)]),
  );
  assert.match(p, /Tout le trafic vient de instagram/);
  assert.match(p, /avant toute reecriture de la page/);
});

test("le direct est toujours expliqué, jamais présenté comme un mystère", () => {
  const p = renderTrafficForPrompt(readTrafficSource([...many("direct", 50), ...many("x", 10)]));
  assert.match(p, /n'est PAS "ils ont tape l'adresse"/);
  assert.match(p, /utm_source/);
  assert.match(p, /ne conclus pas dessus/);
});

test("plusieurs sources : comparer coûte moins cher qu'une refonte", () => {
  const p = renderTrafficForPrompt(
    readTrafficSource([...many("instagram", 30), ...many("facebook", 25), ...many("google", 20)]),
  );
  assert.match(p, /moins couteuse qu'une refonte/);
  assert.match(p, /utm_source/);
});

test("on ne demande pas au modèle de voir le démarrage par source", () => {
  // Jusqu'au 5 août 2026, cette ligne lui disait : "si une source
  // démarre nettement mieux que les autres, dis-le". Il n'a jamais eu
  // de quoi le voir : la répartition ci-dessus compte des VUES, et rien
  // ici ne dit combien de gens ont cliqué sur commencer par source.
  //
  // Demander une observation absente de ce qu'on donne ne laisse que
  // deux issues : se taire, ou inventer. C'est précisément ce que
  // `evidence.ts` passe son temps à empêcher ailleurs.
  const p = renderTrafficForPrompt(
    readTrafficSource([...many("instagram", 30), ...many("facebook", 25), ...many("google", 20)]),
  );
  assert.match(p, /Tu n'as PAS le taux de demarrage par source/);
  assert.doesNotMatch(p, /Si l'une demarre nettement mieux/);
});

test("aucun tiret cadratin dans ce qu'on donne au modèle", () => {
  // Il recopie le ton de ce qu'il reçoit, et le texte produit finit
  // sous les yeux d'une créatrice.
  for (const reading of [
    { kind: "no-data" } as const,
    readTrafficSource(many("instagram", 5)),
    readTrafficSource([...many("direct", 40), ...many("instagram", 20)]),
  ]) {
    assert.ok(!/[—–]/.test(renderTrafficForPrompt(reading)));
  }
});

// ── Les garde-fous structurels ───────────────────────────────────────

test("le viewer envoie la provenance, et seulement sur la vue", () => {
  // Le referrer ne dit d'où vient la personne qu'au PREMIER écran ;
  // aux events suivants il pointe sur notre propre page.
  const src = readFileSync(new URL("../../components/quiz/PublicQuizClient.tsx", import.meta.url), "utf8");
  assert.ok(/classifyTraffic\(/.test(src), "le viewer doit classer la visite");
  assert.ok(
    /event === "view"[\s\S]{0,200}classifyTraffic\(/.test(src),
    "la classification est gatée sur l'event view",
  );
});

test("le serveur refiltre ce que le viewer envoie", () => {
  // Le viewer tourne chez le visiteur : ce qu'il envoie est modifiable.
  const src = readFileSync(new URL("../../app/api/quiz/[quizId]/track/route.ts", import.meta.url), "utf8");
  assert.ok(/sanitizeVisitMeta\(body\.meta\)/.test(src), "jamais body.meta brut en base");
  assert.ok(!/meta: body\.meta/.test(src), "l'ancien passage direct ne doit pas revenir");
});

test("l'analyse IA reçoit bien la provenance", () => {
  const src = readFileSync(new URL("../../lib/quiz/insights.ts", import.meta.url), "utf8");
  assert.ok(/renderTrafficForPrompt\(/.test(src));
  assert.ok(/readTrafficSource\(/.test(src));
});
