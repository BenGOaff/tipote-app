#!/usr/bin/env node
// scripts/check-assets.mjs
//
// LES IMAGES DES CRÉATRICES SONT-ELLES VRAIMENT SERVIES ?
//
// PANNE DU 31 AOÛT 2026. Toutes les images de toutes les créatrices ont
// répondu 403 pendant des heures, favicons comprises, parce que le bloc
// qui sert `/assets/` avait été écrit dans la config NGINX alors que
// c'est CADDY qui répond sur ce domaine.
//
// -- CE CONTRÔLE DISTINGUE CE QU'IL EST CENSÉ DISTINGUER ---------------
//
// C'est tout son intérêt, et c'est la leçon des clés Supabase du
// 22 août : un contrôle qui ne fait pas la différence est pire qu'un
// contrôle absent.
//
//   403 -> la requête est REFUSÉE avant d'atteindre le disque. C'est la
//          signature des vidéos appliquée à des images publiques :
//          LA PANNE. Aucun fichier n'est perdu, ils sont refusés.
//   404 -> la route arrive bien au serveur de fichiers, et ce fichier
//          là n'existe pas. C'EST LE RÉSULTAT ATTENDU : on demande
//          exprès un nom qui n'existe pas.
//   200 -> servi (et alors le nom demandé existait, ce qui serait
//          surprenant, mais ce n'est pas une panne).
//
// On n'a donc besoin NI d'un vrai fichier, NI d'un secret : c'est ce
// qui permet de lancer ce contrôle n'importe quand, y compris avant
// d'avoir envoyé la moindre image.
//
// -- USAGE -------------------------------------------------------------
//
//   npm run check:assets
//
// Il lit `NEXT_PUBLIC_ASSETS_BASE_URL` dans le `.env` du dépôt, sans
// l'exporter dans le shell (`set -a` a déjà mis les deux apps par terre
// le 22 août).

import { readFileSync } from "node:fs";

function lireVar(nom) {
  const duShell = (process.env[nom] ?? "").trim();
  if (duShell) return duShell;
  for (const fichier of [".env", ".env.local"]) {
    let brut = "";
    try {
      brut = readFileSync(new URL(`../${fichier}`, import.meta.url), "utf8");
    } catch {
      continue;
    }
    for (const ligne of brut.split(/\r?\n/)) {
      const t = ligne.trim().replace(/^export\s+/, "");
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0 || t.slice(0, eq).trim() !== nom) continue;
      return t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2").trim();
    }
  }
  return "";
}

const BASE = lireVar("NEXT_PUBLIC_ASSETS_BASE_URL").replace(/\/+$/, "");

if (!BASE) {
  console.log(
    "NEXT_PUBLIC_ASSETS_BASE_URL n'est pas posee.\n" +
      "Les images vont chez Supabase, comme avant : il n'y a rien a verifier ici.",
  );
  process.exit(0);
}

// Un nom qui n'existe pas, volontairement : c'est le CODE de la reponse
// qui nous renseigne, pas le contenu.
const cible = `${BASE}/logos/controle-de-service-inexistant.webp`;

console.log(`  Base   : ${BASE}`);
console.log(`  Sonde  : ${cible}\n`);

let res;
try {
  res = await fetch(cible, { redirect: "manual" });
} catch (e) {
  console.error(`  INJOIGNABLE : ${e.message}`);
  console.error("  Le domaine ne repond pas du tout. Verifier le DNS et Caddy.");
  process.exit(2);
}

if (res.status === 403) {
  console.error("  403 -> LES IMAGES SONT REFUSEES AVANT LE DISQUE.");
  console.error("");
  console.error("  C'est la panne du 31 aout : le domaine des videos exige un");
  console.error("  lien signe, et une image publique n'en porte pas.");
  console.error("");
  console.error("  AUCUN FICHIER N'EST PERDU : ils sont sur le serveur, refuses");
  console.error("  a la porte. Le correctif est le bloc `handle_path /assets/*`");
  console.error("  dans infra/caddy/Caddyfile du depot TIQUIZ (il porte la config Caddy).");
  process.exit(1);
}

if (res.status === 404) {
  console.log("  404 -> OK. La route atteint bien le serveur de fichiers.");
  console.log("  (404 est le resultat ATTENDU : ce nom n'existe pas exprès.)");
  process.exit(0);
}

if (res.status === 200) {
  console.log("  200 -> servi. La route fonctionne.");
  process.exit(0);
}

console.error(`  ${res.status} -> reponse inattendue.`);
console.error("  Ni 404 (route saine) ni 403 (refus d'authentification).");
process.exit(1);
