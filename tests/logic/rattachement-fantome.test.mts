// tests/logic/rattachement-fantome.test.mts
//
// UN RATTACHEMENT QUI NE DÉSIGNE PERSONNE N'EST PAS UN RATTACHEMENT
// (trouvé sur un test de Béné, 29 août 2026).
//
// Elle s'inscrit sur `tipote.fr/part-tiquiz-gratuit/?sa=sa0134…` pour
// vérifier qu'elle est bien référencée. La conversion est écrite chez
// nous avec ce `sa`, et la requête montre :
//
//   sa          : sa013476947331a3b65a708ef70cabd5809b547764
//   affilie     : null      <- absent de la table `affiliates`
//   code_public : null
//
// La cascade d'attribution était `conversion ?? ref ?? sa_hint`, suivie
// d'UN SEUL contrôle de registre. Donc cette conversion gagnait, échouait
// au contrôle, et n'essayait JAMAIS le `?ref=` qui suivait.
//
// Conséquence : cette adresse ne pouvait plus jamais être attribuée à
// personne, quel que soit le lien emprunté ensuite. Le rattachement
// périmé ne se contentait pas de ne rien payer, il EMPÊCHAIT le bon
// candidat de payer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("lib/affiliate/attribution.ts", "utf8");

test("les candidats sont essayés dans l'ordre, pas figés sur le premier", () => {
  // L'ancienne forme : `conversion?.sa ?? saDuRef ?? (saHint || null)`,
  // un seul `sa` puis un seul contrôle. Elle ne doit pas revenir.
  assert.ok(
    !/const sa = conversion\?\.sa \?\? saDuRef/.test(src),
    "la cascade fige de nouveau le premier candidat",
  );
  assert.match(src, /const candidats = \[conversion\?\.sa, saDuRef, saHint \|\| null\]/);
  assert.match(src, /for \(const candidat of candidats\)/);
});

test("on ne saute QUE l'introuvable, jamais un affilié en pause", () => {
  // La nuance vaut de l'argent : un affilié `paused` ou `banned` EXISTE.
  // Son rattachement est réel, il est simplement sans commission (règle
  // du 26 août). Passer au suivant paierait quelqu'un d'AUTRE à sa
  // place, sur un contact qu'il a amené.
  const boucle = src.slice(
    src.indexOf("for (const candidat of candidats)"),
    src.indexOf("if (!sa) return { status: \"no_affiliate_match\" };"),
  );
  assert.match(boucle, /if \(!lu\) \{/, "le saut ne porte pas sur l'absence de ligne");
  assert.ok(
    !/status/.test(boucle),
    "le statut de l'affilié intervient dans le choix du candidat, il ne doit pas",
  );
  // Et le refus pour cause de statut reste APRÈS la boucle, inchangé.
  assert.match(src, /if \(!aff \|\| aff\.status !== "active"\) \{\s*\n\s*return \{ status: "affiliate_not_registered", sa \};/);
});

test("le registre est lu par UNE fonction, appelée par candidat", () => {
  // Recopier la double lecture de colonnes dans la boucle aurait
  // reintroduit la divergence que son commentaire décrit.
  assert.match(src, /async function lireAffilie\(sa: string\)/);
  assert.match(src, /const lu = await lireAffilie\(candidat\)/);
});
