// tests/logic/check-cron-secret.test.mts
//
// « unauthorized » sur le cron de maturation (11 septembre 2026) : trois
// valeurs pouvaient être fausses et rien ne les distinguait. Ce test fige
// le contrôle qui les départage, et la porte GET qui vérifie le secret
// sans approuver une seule commission.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { lireCleDuTexte, verdict } from "../../scripts/check-cron-secret.mjs";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

test("la clé se lit dans le texte du .env sans l'exporter : guillemets et espaces retirés", () => {
  assert.equal(lireCleDuTexte('A=1\nCRON_SECRET="abc def"\nB=2', "CRON_SECRET"), "abc def");
  assert.equal(lireCleDuTexte("export CRON_SECRET= xyz \n", "CRON_SECRET"), "xyz");
  assert.equal(lireCleDuTexte("CRON_SECRET_2=nope\n", "CRON_SECRET"), "");
  assert.equal(lireCleDuTexte("", "CRON_SECRET"), "");
});

test("un sous-shell qui rend une valeur VIDE est nommé, avec la commande qui ne lit que la clé", () => {
  const v = verdict({ fichier: "s3cret-s3cret", shell: "", processus: "s3cret-s3cret", standalone: "", pingLocal: 401, pingPublic: 401 });
  assert.equal(v.ok, false);
  assert.ok(v.problemes.some((p) => p.includes("sous-shell") && p.includes("grep -m1 '^CRON_SECRET='")));
  // Jamais la valeur, seulement sa longueur.
  assert.ok(!v.lignes.join("\n").includes("s3cret"));
  assert.ok(v.lignes.some((l) => l.includes("13 caractères")));
});

test("un processus qui tient une AUTRE valeur est nommé, et la sortie est un --update-env depuis le dépôt", () => {
  const v = verdict({ fichier: "aaaa", shell: "aaaa", processus: "bbbb", standalone: "aaaa", pingLocal: 401, pingPublic: 401 });
  assert.equal(v.ok, false);
  assert.ok(v.problemes.some((p) => p.includes("AUTRE valeur") && p.includes("--update-env")));
  assert.ok(!v.problemes.join("\n").includes("bbbb"));
});

test("PM2 muet + .next/standalone/.env absent = le serveur tourne SANS la clé, et ça se dit", () => {
  const v = verdict({ fichier: "aaaa", shell: "aaaa", processus: "", standalone: "", pingLocal: 401, pingPublic: undefined });
  assert.ok(v.problemes.some((p) => p.includes("SANS CRON_SECRET")));
  // Et la même situation avec le standalone à jour n'est PAS une panne.
  const w = verdict({ fichier: "aaaa", shell: "aaaa", processus: "", standalone: "aaaa", pingLocal: 200, pingPublic: 200 });
  assert.equal(w.ok, true);
});

test("local 200 et public 401 accusent le CHEMIN, pas la valeur", () => {
  const v = verdict({ fichier: "aaaa", shell: "aaaa", processus: "aaaa", standalone: "aaaa", pingLocal: 200, pingPublic: 401 });
  assert.ok(v.problemes.some((p) => p.includes("Cloudflare")));
});

test("tout s'accorde et la route refuse quand même : le script DIT qu'il ne sait pas", () => {
  const v = verdict({ fichier: "aaaa", shell: "aaaa", processus: "aaaa", standalone: "aaaa", pingLocal: 401, pingPublic: 401 });
  assert.equal(v.ok, false);
  assert.ok(v.problemes.some((p) => p.includes("ne sait pas pourquoi")));
});

test("la route répond en GET après le MÊME contrôle, et ce GET n'approuve rien", () => {
  const src = sansCommentaires(readFileSync("app/api/cron/approuver-commissions/route.ts", "utf8"));
  const get = src.indexOf("export async function GET(");
  const post = src.indexOf("export async function POST(");
  assert.ok(get >= 0 && post >= 0, "les deux méthodes existent");
  const corpsGet = src.slice(get, post);
  assert.ok(corpsGet.includes("autorise(req)"), "le GET passe par la même porte");
  assert.ok(!corpsGet.includes("approuverCommissionsMures"), "le GET n'approuve rien");
  assert.ok(src.slice(post).includes("approuverCommissionsMures("), "le POST, lui, approuve");
});

test("le script est branché en npm et ne tourne pas avec un drapeau que Node 20 refuse", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["check:cron-secret"], "node scripts/check-cron-secret.mjs");
});
