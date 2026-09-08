// tests/logic/favicon-des-clientes.test.mts
//
// LE FAVICON D'UNE CRÉATRICE SUR SON DOMAINE PERSO (Béné, 7 sept. 2026).
//
// "Pour le favicon c'est pas un conflit entre NOS favicon et ceux que
// nos users ajoutent pour leur branding dans tiquiz et tipote quand ils
// ajoutent leur domaine ?"
//
// Elle avait raison, et c'était un vrai bug, MESURÉ en production avant
// d'y toucher (cache Cloudflare contourné) :
//
//   quiz.tipote.com/favicon.ico -> image/x-icon, 128x128, max-age=14400
//   app.tipote.com/favicon.ico  -> image/png,    512x512, max-age=300
//
// La route `app/favicon.ico/route.ts` pose `max-age=300` et ne peut
// JAMAIS rendre `image/x-icon` (elle lit un PNG et le déclare comme
// tel). Tipote portait donc sa signature ; Tiquiz servait le FICHIER
// STATIQUE `public/favicon.ico`, qui masquait la route.
//
// Conséquence : sur Tiquiz, le favicon qu'une créatrice a téléversé pour
// son domaine perso n'était JAMAIS servi. Le fichier statique gagne, et
// la route ne tournait pas une seule fois.
//
// Le serveur de dev le disait à chaque requête ("A conflicting public
// file and page file was found for path /favicon.ico"), et personne ne
// lisait cette ligne : elle passait pour du bruit.
//
// LA CORRECTION NE COÛTE RIEN : `public/favicon.ico` était identique à
// l'octet près à `public/favicon-tiquiz.png`, que la route sert par
// défaut. Sur nos domaines, rien ne bouge.
//
// CE TEST VIT DANS LES DEUX DÉPÔTS. Tipote porte la même route et n'a
// pas (encore) eu le fichier statique : un garde-fou qui ne protège
// qu'un des deux jumeaux ne protège personne.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const RACINE = process.cwd();

test("une route /favicon.ico dynamique n'est jamais masquée par un fichier statique", () => {
  const route = join(RACINE, "app", "favicon.ico", "route.ts");
  if (!existsSync(route)) return; // Pas de route : rien à protéger.

  const statique = join(RACINE, "public", "favicon.ico");
  assert.equal(
    existsSync(statique),
    false,
    "public/favicon.ico masque app/favicon.ico/route.ts : le fichier statique gagne, " +
      "donc le favicon du domaine perso d'une créatrice n'est jamais servi. " +
      "Mesuré en production le 7 septembre 2026.",
  );
});

test("le favicon par défaut que la route sert existe toujours", () => {
  const route = join(RACINE, "app", "favicon.ico", "route.ts");
  if (!existsSync(route)) return;

  // ON LIT LE NOM DANS LA ROUTE, on ne le recopie pas.
  //
  // Tiquiz sert `favicon-tiquiz.png`, Tipote sert `favicon.png`. Une
  // liste de noms écrite ici divergerait au premier renommage, et c'est
  // le défaut que ces dépôts paient en boucle : le test dirait vert sur
  // un fichier disparu.
  const source = readFileSync(route, "utf-8");
  const trouve = /join\(\s*process\.cwd\(\)\s*,\s*"public"\s*,\s*"([^"]+)"\s*\)/.exec(source);
  assert.ok(trouve, "la route ne lit plus un fichier de public/ : ce test ne sait plus quoi vérifier");

  // La route lit ce fichier pour NOS domaines et comme repli quand le
  // favicon d'une créatrice est introuvable. Le retirer en même temps
  // que le statique laisserait les deux cas sans image du tout, et ça
  // ne se verrait qu'en regardant un onglet.
  assert.ok(
    existsSync(join(RACINE, "public", trouve[1])),
    `le favicon par défaut lu par app/favicon.ico/route.ts (public/${trouve[1]}) a disparu`,
  );
});
