// tests/logic/support-relay.test.mts
//
// LA PORTE EST ICI, LA FILE EST DANS TIQUIZ.
//
// Béné, 23 août 2026 : "s'il n'a pas reçu ses accès, comment il accède à
// quiz.tipote.com/support ? Pas con hein ??? Je veux un service de
// ticketing dans le centre d'aide commun à toutes les app,
// essentiellement pour Tiquiz et L'Atelier qui sont vendus en ce moment,
// avec ticket relié à la fiche client si elle existe."
//
// Ce qu'on a trouvé en allant le faire : il y avait DEUX files de
// tickets, dans deux bases, avec deux écrans d'admin. `support_tickets`
// ici depuis le 12 mars (les escalades du robot d'aide) et
// `support_tickets` dans Tiquiz depuis le 22 août (le formulaire). Une
// demande pouvait attendre des jours dans celle qu'on ne regardait pas.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { messageLisible, tiquizBaseUrl } from "../../lib/support/relayRules.ts";

function lire(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

test("le relais ne part JAMAIS vers une adresse locale", () => {
  // Meme garde-fou que resolveAppUrl (drame Veronique, 2 aout) : un `??`
  // ne protege que de la variable ABSENTE, jamais de la variable fausse.
  // Un localhost ici enverrait les tickets dans le vide, en silence.
  assert.equal(tiquizBaseUrl({}), "https://quiz.tipote.com");
  assert.equal(tiquizBaseUrl({ TIQUIZ_APP_URL: "" }), "https://quiz.tipote.com");
  assert.equal(tiquizBaseUrl({ TIQUIZ_APP_URL: "http://localhost:3000" }), "https://quiz.tipote.com");
  assert.equal(tiquizBaseUrl({ TIQUIZ_APP_URL: "https://127.0.0.1" }), "https://quiz.tipote.com");
  assert.equal(tiquizBaseUrl({ TIQUIZ_APP_URL: "https://staging.tipote.com" }), "https://staging.tipote.com");
  assert.equal(tiquizBaseUrl({ TIQUIZ_APP_URL: "https://quiz.tipote.com/" }), "https://quiz.tipote.com");
});

test("un ticket venu du robot n'arrive pas VIDE dans la file", () => {
  assert.equal(messageLisible("Ma question", []), "Ma question");
  const depuisLeChat = messageLisible(null, [
    { role: "user", content: "Je n'ai pas recu mes acces" },
    { role: "assistant", content: "As-tu regarde tes spams ?" },
  ]);
  assert.match(depuisLeChat, /Je n'ai pas recu mes acces/);
  assert.match(depuisLeChat, /Robot : As-tu regarde/);
  assert.equal(messageLisible(null, null), "");
  // Le message ECRIT gagne : s'il existe, c'est ce que la personne a
  // voulu dire, pas ce qu'elle a tape au robot avant.
  assert.equal(messageLisible("  Le vrai message  ", [{ role: "user", content: "autre" }]), "Le vrai message");
});

test("on relaie vers Tiquiz, et on ne perd JAMAIS la demande", () => {
  const src = lire("app/api/support/ticket/route.ts");
  assert.ok(src.includes("relayerVersTiquiz"), "la route n'envoie plus le ticket dans la file unique");
  assert.ok(
    src.includes("ecrireEnSecours"),
    "plus de filet local : une panne de Tiquiz jetterait la demande alors qu'elle a vu 'envoye'",
  );
  // L'ordre compte : on relaie, ET on ne tombe en local que si ca rate.
  // Les APPELS, pas les imports : ceux-ci sont ranges par ordre
  // alphabetique en haut du fichier (meme piege que apres-paiement).
  assert.ok(
    src.indexOf("await relayerVersTiquiz(") < src.indexOf("await ecrireEnSecours("),
    "le local n'est plus un repli mais le chemin normal : les deux files reviendraient",
  );
});

test("la limite par IP reste ICI, sur l'adresse reelle de la personne", () => {
  // Le relais serveur a serveur part toujours de la meme IP : la limite
  // de Tiquiz couperait tout le centre d'aide des la sixieme personne.
  const src = lire("app/api/support/ticket/route.ts");
  assert.ok(src.includes("x-forwarded-for"), "la limite ne regarde plus l'IP de la personne");
  assert.ok(src.includes("trop_de_demandes"), "le refus ne dit plus pourquoi");
});

test("l'ecran d'admin d'ici DIT ou est passee la file vivante", () => {
  // Sans ce bandeau, Bene surveillerait un ecran qui ne bouge plus.
  const src = lire("components/support/AdminTicketsClient.tsx");
  assert.ok(
    src.includes("Les nouvelles demandes arrivent dans Tiquiz"),
    "l'ancienne file ne dit plus qu'elle est l'ancienne",
  );
  assert.ok(src.includes("quiz.tipote.com/admin"), "le lien vers la file vivante a disparu");
});

test("le formulaire du centre d'aide existe, et il est dans les 7 langues", () => {
  const src = lire("components/support/SupportContactForm.tsx");
  for (const loc of ["fr", "en", "es", "it", "pt", "pt-BR", "ar"]) {
    assert.ok(
      new RegExp(`"?${loc}"?:`).test(src),
      `${loc} : le formulaire de contact n'est pas traduit`,
    );
  }
  assert.ok(src.includes("produitParDefaut"), "on ne peut plus pre-selectionner le produit");
  // Le centre d'aide doit le rendre, sinon il n'existe pour personne.
  assert.ok(
    lire("components/support/SupportCenterClient.tsx").includes("<SupportContactForm"),
    "le formulaire n'est plus affiche dans le centre d'aide",
  );
});

test("aucun tiret cadratin dans ce que lit la personne", () => {
  const src = lire("components/support/SupportContactForm.tsx");
  const textes = src.match(/"[^"\n]{4,}"/g) ?? [];
  const fautifs = textes.filter((t) => /[–—]/.test(t));
  assert.deepEqual(fautifs, [], `tirets cadratins : ${fautifs.join(", ")}`);
});
