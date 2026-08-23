// tests/logic/standalone-env.test.mts
//
// LE SERVEUR STANDALONE DOIT AVOIR SES FICHIERS D'ENVIRONNEMENT.
//
// PANNE DU 22 AOÛT AU SOIR. Béné : "pourquoi j'ai tous mes contenus mais
// pas mes clients dans Tipote ?" La question contenait le diagnostic.
//
// `.next/standalone/server.js` fait `process.chdir(__dirname)`, donc Next
// cherche ses fichiers d'environnement DANS `.next/standalone/`. Next n'y
// copie rien. L'app vivait donc uniquement sur ce que PM2 gardait en
// mémoire, hérité d'un `--update-env` parfois vieux de plusieurs mois.
//
// Ce qui a produit exactement ce partage :
//   - les CONTENUS s'affichaient, parce qu'ils passent par la clé anon,
//     GRAVÉE dans le build au moment du `next build` ;
//   - les CLIENTS avaient disparu, parce qu'ils passent par la clé de
//     service, lue dans le processus, où PM2 avait poussé celle de
//     l'autre app.
//
// Le même journal portait un `Missing env var POPQUIZ_TUS_URL` pour une
// variable pourtant présente dans `.env.local` : même cause.
//
// Ce test EXÉCUTE le script de postbuild dans un dossier jetable. Une
// assertion sur le texte du fichier passerait au vert le jour où le
// script plante avant d'arriver à la copie.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const SCRIPT = path.join(process.cwd(), "scripts", "postbuild-standalone-static.cjs");

/** Un faux dossier de build, avec le minimum que le script exige. */
function chantier(fichiersEnv: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "standalone-env-"));
  fs.mkdirSync(path.join(racine, ".next", "static"), { recursive: true });
  fs.writeFileSync(path.join(racine, ".next", "static", "chunk.js"), "// chunk");
  fs.mkdirSync(path.join(racine, ".next", "standalone"), { recursive: true });
  fs.mkdirSync(path.join(racine, "public"), { recursive: true });
  fs.writeFileSync(path.join(racine, "public", "favicon.ico"), "");
  for (const [nom, contenu] of Object.entries(fichiersEnv)) {
    fs.writeFileSync(path.join(racine, nom), contenu);
  }
  execFileSync(process.execPath, [SCRIPT], { cwd: racine, stdio: "pipe" });
  return racine;
}

test("le .env atterrit a cote du server.js", () => {
  const racine = chantier({ ".env": "SUPABASE_SERVICE_ROLE_KEY=valeur\n" });
  const copie = path.join(racine, ".next", "standalone", ".env");
  assert.ok(fs.existsSync(copie), "le serveur standalone n'a plus son .env : il depend de PM2");
  assert.equal(fs.readFileSync(copie, "utf8"), "SUPABASE_SERVICE_ROLE_KEY=valeur\n");
  fs.rmSync(racine, { recursive: true, force: true });
});

test(".env.local est copie AUSSI (le Missing env var POPQUIZ_TUS_URL)", () => {
  // La variable existait dans `.env.local` et le serveur ne la voyait
  // pas. Ne copier que `.env` laisserait ce bug entier.
  const racine = chantier({
    ".env": "A=1\n",
    ".env.local": "POPQUIZ_TUS_URL=https://exemple\n",
  });
  const dossier = path.join(racine, ".next", "standalone");
  assert.ok(fs.existsSync(path.join(dossier, ".env")));
  assert.ok(
    fs.existsSync(path.join(dossier, ".env.local")),
    ".env.local n'est plus copie : une variable qui n'y vit que la disparait",
  );
  fs.rmSync(racine, { recursive: true, force: true });
});

test("la copie n'est lisible que par son proprietaire", () => {
  // Ces fichiers portent des secrets. `.next/standalone/` n'est pas servi
  // sur le web, mais on ne compte pas là dessus.
  const racine = chantier({ ".env": "SECRET=x\n" });
  const mode = fs.statSync(path.join(racine, ".next", "standalone", ".env")).mode & 0o777;
  assert.equal(mode, 0o600, `permissions ${mode.toString(8)} au lieu de 600`);
  fs.rmSync(racine, { recursive: true, force: true });
});

test("aucun fichier d'environnement : le postbuild ne casse pas", () => {
  // C'est le cas d'une machine de developpement, et d'un CI. Un postbuild
  // qui echouerait la ferait echouer TOUS les builds.
  const racine = chantier({});
  assert.ok(fs.existsSync(path.join(racine, ".next", "standalone", ".next", "static", "chunk.js")));
  assert.ok(!fs.existsSync(path.join(racine, ".next", "standalone", ".env")));
  fs.rmSync(racine, { recursive: true, force: true });
});

test("le controle des cles regarde AUSSI le processus qui tourne", () => {
  // `pm2 env` affichait encore l'ancienne clé alors que le processus
  // tournait déjà avec la bonne. `/proc/<pid>/environ` ne ment pas.
  //
  // Et la détection se fait sur le DOSSIER DE TRAVAIL du processus, pas
  // sur sa ligne de commande : `server.js` fait `chdir(__dirname)`, donc
  // le cwd est fiable, que PM2 ait lancé un chemin absolu ou relatif.
  // Une première version regardait la ligne de commande et ratait le
  // second cas.
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/check-supabase-keys.mjs"), "utf8");
  assert.ok(src.includes("/proc"), "le controle ne lit plus l'environnement du processus");
  assert.ok(src.includes("readlinkSync"), "la detection ne passe plus par le dossier de travail");
  assert.ok(
    !/cmdline[\s\S]{0,200}includes\(attendu\)/.test(src),
    "la detection est revenue a la ligne de commande, qui rate un lancement relatif",
  );
});
