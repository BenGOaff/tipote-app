// tests/logic/audit-24-aout.test.mts
//
// L'AUDIT DEMANDÉ PAR BÉNÉ : "je veux un système fiable et stable."
//
// La part côté Tipote. Le gros de l'audit vit dans le repo Tiquiz
// (paiements, abonnements, webhooks) ; ici c'est le relais du centre
// d'aide et le registre des affiliées.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function lire(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Le code SEUL : un commentaire a le droit de nommer ce qu'on interdit. */
function code(rel: string): string {
  return lire(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── LA LIMITE PAR IP NE SE DÉSARME PAS ───────────────────────────────

test("la limite du centre d'aide ne remet pas tout le monde a zero", () => {
  // LE BUG : `compteur.clear()` des que la table depassait sa taille.
  // Un garde-fou qu'on peut desarmer en le remplissant n'en est pas un,
  // et il se desarmait aussi tout seul un jour de trafic normal.
  const src = code("app/api/support/ticket/route.ts");
  assert.ok(!/compteur\.clear\(\)/.test(src), "la limite se remet a zero pour tout le monde");
  assert.match(src, /function purger\(/, "plus de purge : la memoire n'est plus bornee");
  // On retire ce qui a EXPIRE, puis les plus anciennes. Jamais tout.
  assert.match(src, /if \(now > v\.jusqu\) compteur\.delete\(cle\)/);
});

test("la limite reste ICI, sur l'adresse reelle", () => {
  // Le relais vers Tiquiz part toujours de la meme IP serveur : la
  // limite de la-bas couperait tout le centre d'aide des la sixieme
  // personne de la journee.
  const src = code("app/api/support/ticket/route.ts");
  // Les APPELS, pas les imports : ceux-ci sont ranges en haut du
  // fichier (meme piege que apres-paiement, 23 aout).
  const iLimite = src.indexOf("tropDeDemandes(ip)");
  const iRelais = src.indexOf("relayerVersTiquiz(");
  assert.ok(iLimite > 0, "la limite par IP a disparu");
  assert.ok(iRelais > iLimite, "la limite passe apres le relais");
});

// ── LE RELAIS NE PERD JAMAIS UNE DEMANDE ─────────────────────────────

test("un relais qui echoue ecrit quand meme la demande", () => {
  // Elle a vu "envoye" : la demande doit exister quelque part.
  // Le filet vit dans `relayTicket.ts` (`ecrireEnSecours`), appele par
  // la route quand le relais echoue.
  assert.match(lire("lib/support/relayTicket.ts"), /support_tickets/, "plus de filet local");
  assert.match(code("app/api/support/ticket/route.ts"), /ecrireEnSecours\(/);
  // Et l'appel a un delai maximum : sans lui, une panne de Tiquiz
  // garderait la requete ouverte jusqu'a ce que la plateforme la tue.
  assert.match(lire("lib/support/relayTicket.ts"), /AbortSignal\.timeout\(/);
});

// ── LE REGISTRE DES AFFILIÉES ────────────────────────────────────────

test("un refus de lecture ne se lit jamais comme `personne`", () => {
  // "Je n'ai pas pu regarder" et "il n'y a personne" n'appellent pas la
  // meme suite : confondre les deux ferait offrir un mois au nom d'une
  // affiliee inconnue.
  const src = lire("app/api/affiliate/proprietaire/route.ts");
  assert.match(src, /reason: "read_failed"/);
  assert.match(src, /status: 502/);
});

test("les portes internes comparent leur secret en temps constant", () => {
  for (const f of [
    "app/api/affiliate/proprietaire/route.ts",
    "app/api/affiliate/attribute-sale/route.ts",
  ]) {
    assert.match(lire(f), /timingSafeEqual/, `${f} : comparaison naive du secret`);
  }
});
