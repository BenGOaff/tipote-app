// tests/logic/affiliate-preview.test.mts
//
// LA PORTE DU CHANTIER.
//
// Béné, 19 août 2026 : "sauf si tu me mets ça sur une page non
// accessible aux affiliés et clients présents pour que je puisse tester
// sans qu'ils le voient", parce que sinon "il va y avoir un moment où ce
// sera tout bugué avec les mauvaises infos, des paiements impossibles".
//
// Ce test protège la seule chose qui compte ici : **une configuration
// absente FERME, elle n'ouvre pas.** C'est l'inverse du `??` avec valeur
// par défaut qui a produit le drame Véronique du 2 août, où une variable
// d'environnement mal renseignée traversait tout sans que rien ne le
// signale. Ici, un `.env` oublié sur le serveur ne peut pas ouvrir un
// chantier en cours à toutes les affiliées.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isPreviewViewer, parsePreviewEmails } from "../../lib/affiliate/preview.ts";

test("sans liste, PERSONNE n'entre", () => {
  // Le cas qui compte : la variable d'environnement n'existe pas encore
  // sur le serveur au moment du deploiement.
  for (const vide of [null, undefined, "", "   ", ",,,", "pas-un-email"]) {
    assert.equal(
      isPreviewViewer("bene@tipote.com", vide),
      false,
      `liste ${JSON.stringify(vide)} : la porte s'ouvre alors qu'elle devrait rester fermee`,
    );
  }
});

test("sans session, personne n'entre non plus", () => {
  for (const vide of [null, undefined, "", "   "]) {
    assert.equal(isPreviewViewer(vide, "bene@tipote.com"), false);
  }
});

test("seules les adresses listees entrent", () => {
  const liste = "bene@tipote.com, test@tipote.com";
  assert.equal(isPreviewViewer("bene@tipote.com", liste), true);
  assert.equal(isPreviewViewer("test@tipote.com", liste), true);
  assert.equal(isPreviewViewer("jocelyne@exemple.fr", liste), false);
});

test("la casse et les espaces ne font pas entrer ni sortir quelqu'un", () => {
  const liste = "  Bene@Tipote.com  ,test@tipote.com";
  assert.equal(isPreviewViewer("BENE@TIPOTE.COM", liste), true);
  assert.equal(isPreviewViewer("  bene@tipote.com ", liste), true);
});

test("une entree qui n'est pas une adresse est ignoree, pas acceptee", () => {
  // Une liste mal remplie ("bene, test") ne doit pas creer une entree
  // vide qui laisserait passer n'importe qui.
  const emails = parsePreviewEmails("bene, test, vrai@exemple.fr, ");
  assert.deepEqual([...emails], ["vrai@exemple.fr"]);
  assert.equal(isPreviewViewer("", "bene, test"), false);
});

test("l'ecran de chantier repond 404, jamais un refus explicite", () => {
  // Un refus explicite annonce qu'il y a quelque chose derriere : une
  // affiliee curieuse saurait qu'un ecran existe et demanderait pourquoi
  // elle n'y a pas droit.
  const page = fs.readFileSync(
    path.join(process.cwd(), "app/affiliate/apercu/liens/page.tsx"),
    "utf8",
  );
  assert.ok(page.includes("notFound()"), "la page n'appelle pas notFound()");
  assert.ok(
    page.includes("canSeeAffiliatePreview"),
    "la page n'est pas derriere la porte du chantier",
  );

  const api = fs.readFileSync(
    path.join(process.cwd(), "app/api/affiliate/ref/route.ts"),
    "utf8",
  );
  assert.ok(
    api.includes("canSeeAffiliatePreview"),
    "l'API du code affilie n'est pas derriere la porte",
  );
  // Les deux verbes doivent etre gardes, pas seulement la lecture.
  const gardes = api.split("canSeeAffiliatePreview").length - 1;
  assert.ok(gardes >= 2, `seulement ${gardes} garde(s) dans l'API : le POST en manque une`);
});

test("l'ecran de chantier n'est lie depuis AUCUN menu", () => {
  // On y va en tapant l'adresse. S'il apparait dans une navigation, il
  // cesse d'etre invisible et la garantie tombe.
  const racine = process.cwd();
  const fautifs: string[] = [];

  const parcourir = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === "node_modules" || entree.name.startsWith(".")) continue;
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entree.name)) continue;
      // La page elle-meme a le droit de parler d'elle-meme.
      if (chemin.includes(path.join("apercu", "liens"))) continue;
      const src = fs.readFileSync(chemin, "utf8");
      if (src.includes("apercu/liens")) {
        fautifs.push(path.relative(racine, chemin));
      }
    }
  };

  parcourir(path.join(racine, "app"));
  parcourir(path.join(racine, "components"));

  assert.deepEqual(fautifs, [], `l'ecran de chantier est lie depuis :\n${fautifs.join("\n")}`);
});

test("le nom de la variable d'environnement ne vit qu'a UN endroit", () => {
  // Meme regle que les URLs canoniques (drame de l'Atelier du 3 aout) :
  // une valeur lue a deux endroits ne se corrige jamais qu'a moitie.
  const racine = process.cwd();
  const trouves: string[] = [];

  const parcourir = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === "node_modules" || entree.name.startsWith(".")) continue;
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entree.name)) continue;
      if (fs.readFileSync(chemin, "utf8").includes("AFFILIATE_PREVIEW_EMAILS")) {
        trouves.push(path.relative(racine, chemin));
      }
    }
  };

  for (const d of ["app", "components", "lib"]) {
    const chemin = path.join(racine, d);
    if (fs.existsSync(chemin)) parcourir(chemin);
  }

  assert.deepEqual(trouves, ["lib/affiliate/preview.ts"], `lue a ${trouves.length} endroits`);
});
