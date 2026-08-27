// tests/logic/coordonnees-affiliee.test.mts
//
// LE FORMULAIRE QUI JETAIT LA MOITIÉ DE LA SAISIE (Béné, 27 août 2026).
//
// "Je ne peux pas enregistrer Tes informations pour la facture, donc
// quand je reviens dessus rien n'a été sauvegardé."
//
// La route refusait TOUTE la requête tant que les coordonnées de
// VERSEMENT n'étaient pas valides : un `return` sur la méthode
// manquante, un autre sur `manquesVersement`, tous les deux AVANT
// l'écriture du profil fiscal. Elle remplissait son adresse et son
// SIREN, cliquait, et le serveur jetait tout parce qu'il n'avait pas
// encore son IBAN.
//
// Le commentaire de la route disait pourtant l'intention juste ("il est
// ACCEPTÉ MÊME INCOMPLET... refuser tout lui ferait tout ressaisir").
// L'intention était bonne, deux `return` posés plus haut la rendaient
// inatteignable. Encore une règle écrite en commentaire, donc pas une
// règle (le `w-full h-auto` des images, le `target` des liens légaux).
//
// -- POURQUOI UN TEST DE SOURCE, ET PAS DE COMPORTEMENT ---------------
//
// La route importe `supabaseAdmin`, donc aucun test ne peut l'importer.
// Ce qui compte ici n'est pas un calcul, c'est un ORDRE : le profil
// fiscal s'écrit AVANT que les coordonnées de versement puissent
// refuser quoi que ce soit. C'est la même forme de test que celui du
// 24 août sur l'ordre de la limite par IP et du relais.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROUTE = readFileSync("app/api/affiliate/coordonnees/route.ts", "utf8");

/**
 * Le corps du PUT, COMMENTAIRES RETIRÉS.
 *
 * Sans ce nettoyage, ce test se trompe tout seul : le commentaire qui
 * explique la correction cite `manquesVersement`, et il est placé plus
 * haut que l'appel. C'est le piège exact du test du 24 août, qui
 * comparait des positions et attrapait les imports rangés en tête de
 * fichier. Un test qui lit du texte doit lire du CODE.
 */
const PUT = ROUTE.slice(ROUTE.indexOf("export async function PUT"))
  .replace(/\/\/[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

test("le profil fiscal s'écrit AVANT toute validation des coordonnées", () => {
  const profil = PUT.indexOf("ecrireProfilFiscalAffiliee({");
  const versement = PUT.indexOf("manquesVersement(candidat)");
  assert.ok(profil > 0, "l'écriture du profil fiscal a disparu de la route");
  assert.ok(versement > 0, "la validation des coordonnées a disparu de la route");
  assert.ok(
    profil < versement,
    "la validation des coordonnées repasse devant le profil fiscal : la saisie de la facture sera de nouveau jetée",
  );
});

test("une méthode de versement absente ne fait plus échouer la requête", () => {
  // C'était le premier `return` du handler. Un moyen de paiement pas
  // encore choisi n'est pas une erreur : c'est l'ordre dans lequel
  // beaucoup de gens remplissent un formulaire.
  assert.ok(
    !/reason:\s*"methode_inconnue"/.test(PUT),
    "la route refuse encore toute la requête quand aucun moyen de versement n'est choisi",
  );
});

test("la réponse dit ce qui a VRAIMENT été enregistré", () => {
  // Sans ce champ, l'écran ne peut qu'annoncer "enregistré" sur un
  // formulaire dont la moitié n'est pas partie : le silence exact qui a
  // fait perdre sa saisie à Béné.
  assert.match(PUT, /versementEnregistre/);
  assert.match(PUT, /\bmanques\b/);
});

test("les coordonnées de versement restent refusées si elles sont invalides", () => {
  // L'assouplissement ne vaut QUE pour le profil fiscal. Un IBAN à
  // moitié saisi produirait un fichier SEPA rejeté par la banque trois
  // jours plus tard.
  assert.match(PUT, /manques\.length === 0/);
  assert.ok(
    PUT.indexOf("manques.length === 0") < PUT.indexOf("ecrireCoordonneesAffiliee"),
    "les coordonnées s'écrivent sans avoir été validées",
  );
});

test("l'écran ne bloque plus la sauvegarde faute de moyen de versement", () => {
  const ecran = readFileSync("app/affiliate/components/CoordonneesVersement.tsx", "utf8");
  const fn = ecran.slice(ecran.indexOf("async function enregistrer"));
  const corps = fn.slice(0, fn.indexOf("setEnvoi(true)"));
  assert.ok(
    !corps.includes("return;"),
    "le garde `if (!methode) return;` est revenu : la saisie de la facture ne partira plus",
  );
});
