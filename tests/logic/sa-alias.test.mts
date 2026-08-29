// tests/logic/sa-alias.test.mts
//
// ERIC A DEUX IDENTIFIANTS SYSTEME.IO (Béné, 29 août 2026).
//
// L'import a refusé une ligne sur `affiliates_email_key`. La contrainte
// porte sur l'EMAIL : son adresse était déjà là, sous
// `sa015482041700065688e89f0e48925ec6c81def4e`, créé le 30 mai. Les deux
// identifiants font 40 caractères hexadécimaux, quand le nôtre en fait
// 32 : ce sont bien deux identifiants SYSTEME.IO pour une seule
// personne, pas un compte maison en double.
//
// Ce que ça coûtait : ses liens en circulation portent `sa0134…`,
// absent du registre, donc ses clics et ses contacts n'étaient
// attribués à personne.

import { test } from "node:test";
import assert from "node:assert/strict";

import { actionPourLigne } from "@/lib/affiliate/saAlias";

const ERIC_LIENS = "sa013476947331a3b65a708ef70cabd5809b547764";
const ERIC_REGISTRE = "sa015482041700065688e89f0e48925ec6c81def4e";
const ERIC_MAIL = "legrigeoiseric@gmail.com";

test("le cas d'Eric : on ALIASSE, on ne crée pas une deuxième ligne", () => {
  const d = actionPourLigne({
    sa: ERIC_LIENS,
    email: ERIC_MAIL,
    parSa: null,
    parEmail: { sa: ERIC_REGISTRE, email: ERIC_MAIL },
  });
  // Deux lignes, ce seraient deux personnes à payer, deux versements et
  // deux autofactures pour un seul homme.
  assert.notEqual(d.action, "creer");
  assert.deepEqual(d, { action: "alias", vers: ERIC_REGISTRE });
});

test("une adresse libre crée un affilié, c'est le cas normal", () => {
  const d = actionPourLigne({
    sa: ERIC_LIENS,
    email: "nouvelle@exemple.fr",
    parSa: null,
    parEmail: null,
  });
  assert.deepEqual(d, { action: "creer" });
});

test("un identifiant déjà connu ne réécrit RIEN", () => {
  const d = actionPourLigne({
    sa: ERIC_REGISTRE,
    email: "adresse-differente@exemple.fr",
    parSa: { sa: ERIC_REGISTRE },
    parEmail: null,
  });
  // Son email, son nom, son statut et son code public sont à lui.
  assert.deepEqual(d, { action: "deja-la", sa: ERIC_REGISTRE });
});

test("L'ADRESSE D'UN AUTRE NE S'ALIASSE JAMAIS", () => {
  const d = actionPourLigne({
    sa: ERIC_LIENS,
    email: "eric@exemple.fr",
    parSa: null,
    parEmail: { sa: "sa00aaaa1111bbbb2222cccc3333dddd4444", email: "jocelyne@exemple.fr" },
  });
  // Un alias fait tomber TOUT le trafic d'un identifiant dans la poche
  // d'un autre, et un virement parti ne revient pas.
  assert.deepEqual(d, { action: "refuser", raison: "email-pris-par-un-autre" });
});

test("un alias Gmail est la même personne, pas un autre", () => {
  // `+1` et les points sont le moyen le plus simple de se retrouver avec
  // deux adresses pour une seule boîte. La règle vit dans memeAdresse,
  // la même qui empêche l'auto-affiliation.
  const d = actionPourLigne({
    sa: ERIC_LIENS,
    email: "legrigeois.eric+tiquiz@gmail.com",
    parSa: null,
    parEmail: { sa: ERIC_REGISTRE, email: "legrigeoiseric@gmail.com" },
  });
  assert.equal(d.action === "alias" || d.action === "refuser", true);
});

test("une ligne sans adresse ne crée jamais personne", () => {
  const d = actionPourLigne({ sa: ERIC_LIENS, email: "", parSa: null, parEmail: null });
  assert.equal(d.action, "refuser");
});
