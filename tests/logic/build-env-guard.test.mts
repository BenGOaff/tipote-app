// tests/logic/build-env-guard.test.mts
//
// LA PANNE DU 22 AOÛT 2026 : les deux apps ont servi la base Supabase de
// l'autre pendant plusieurs heures, avec deux `.env` parfaitement justes.
// Le shell portait les variables de l'autre app, et Next lit
// `process.env` AVANT `.env`.
//
// Ce test rejoue exactement cette situation. S'il rougit, c'est que le
// garde-fou ne verrait plus passer la panne qui a mis les deux apps par
// terre.

import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CLES_TOLEREES,
  estSecret,
  fichiersEnv,
  formaterRapport,
  lireEnvDuRepo,
  parseEnvFile,
  trouverConflits,
  verifier,
} from "../../scripts/check-build-env.mjs";

const TIQUIZ = "https://ottpciabnrclwgdlwjdt.supabase.co";
const TIPOTE = "https://mmwyfqfbfkvcnrkyvagv.supabase.co";

function repoTemporaire(fichiers: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "env-guard-"));
  for (const [nom, contenu] of Object.entries(fichiers)) {
    writeFileSync(join(dir, nom), contenu, "utf8");
  }
  return dir;
}

test("le shell qui porte l'autre app fait echouer le build", () => {
  const dir = repoTemporaire({
    ".env": `NEXT_PUBLIC_SUPABASE_URL=${TIQUIZ}\nNEXT_PUBLIC_APP_URL=https://quiz.tipote.com\n`,
  });
  try {
    const rapport = verifier(dir, {
      NEXT_PUBLIC_SUPABASE_URL: TIPOTE,
      NEXT_PUBLIC_APP_URL: "https://app.tipote.com",
    });
    assert.ok(rapport, "le build aurait ete accepte : c'est exactement la panne");
    assert.match(rapport as string, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(rapport as string, /NEXT_PUBLIC_APP_URL/);
    // Les deux valeurs sont nommees : sans elles, elle ne peut rien faire
    // du message.
    assert.ok((rapport as string).includes(TIQUIZ));
    assert.ok((rapport as string).includes(TIPOTE));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("un shell propre laisse passer le build", () => {
  const dir = repoTemporaire({
    ".env": `NEXT_PUBLIC_SUPABASE_URL=${TIQUIZ}\nSUPABASE_SERVICE_ROLE_KEY=abc\n`,
  });
  try {
    assert.equal(verifier(dir, { PATH: "/usr/bin", HOME: "/home/tipote" }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("le meme shell que le fichier laisse passer le build", () => {
  const dir = repoTemporaire({ ".env": `NEXT_PUBLIC_SUPABASE_URL=${TIQUIZ}\n` });
  try {
    assert.equal(verifier(dir, { NEXT_PUBLIC_SUPABASE_URL: TIQUIZ }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("un repo sans fichier d'environnement ne bloque personne", () => {
  const dir = repoTemporaire({});
  try {
    assert.equal(verifier(dir, { NEXT_PUBLIC_SUPABASE_URL: TIPOTE }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("le rapport n'imprime JAMAIS la valeur d'un secret", () => {
  const rapport = formaterRapport(
    [
      { cle: "SUPABASE_SERVICE_ROLE_KEY", fichier: "vraie-cle-tiquiz", shell: "vraie-cle-tipote" },
      { cle: "CRON_SECRET", fichier: "secret-a", shell: "secret-b" },
      { cle: "OPENAI_API_KEY_OWNER", fichier: "sk-a", shell: "sk-b" },
    ],
    [".env"],
  );
  for (const valeur of ["vraie-cle-tiquiz", "vraie-cle-tipote", "secret-a", "secret-b", "sk-a", "sk-b"]) {
    assert.ok(!rapport.includes(valeur), `le rapport laisse fuiter ${valeur}`);
  }
  // Elle doit quand meme savoir QUELLE cle diverge.
  assert.match(rapport, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("estSecret couvre les familles de noms qu'on utilise vraiment", () => {
  for (const cle of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "OPENAI_API_KEY_OWNER",
    "SIO_KEY_ENCRYPTION_KEY",
    "AFFILIATE_INTERNAL_SECRET",
    "SALES_PREVIEW_TOKEN",
    "SMTP_PASSWORD",
  ]) {
    assert.ok(estSecret(cle), `${cle} devrait etre masquee`);
  }
  for (const cle of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "SMTP_HOST"]) {
    assert.ok(!estSecret(cle), `${cle} doit rester lisible`);
  }
});

test("les reglages d'execution ne declenchent pas de fausse alerte", () => {
  const fichier = new Map([
    ["PORT", "3000"],
    ["NODE_ENV", "production"],
    ["NEXT_PUBLIC_SUPABASE_URL", TIQUIZ],
  ]);
  const conflits = trouverConflits(fichier, {
    PORT: "3002",
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: TIQUIZ,
  });
  assert.deepEqual(conflits, []);
  assert.ok(CLES_TOLEREES.has("PORT"));
});

test("l'ordre des fichiers est celui de Next, premier trouve gagnant", () => {
  assert.deepEqual(fichiersEnv("production"), [
    ".env.production.local",
    ".env.local",
    ".env.production",
    ".env",
  ]);
  const dir = repoTemporaire({
    ".env": `NEXT_PUBLIC_SUPABASE_URL=${TIPOTE}\n`,
    ".env.local": `NEXT_PUBLIC_SUPABASE_URL=${TIQUIZ}\n`,
  });
  try {
    const { valeurs } = lireEnvDuRepo(dir);
    assert.equal(valeurs.get("NEXT_PUBLIC_SUPABASE_URL"), TIQUIZ);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("le parseur encaisse ce qu'on ecrit vraiment dans un .env", () => {
  const v = parseEnvFile(
    [
      "# un commentaire",
      "",
      "  NEXT_PUBLIC_APP_URL=https://quiz.tipote.com",
      'SMTP_FROM="Tiquiz <hello@tipote.com>"',
      "export CRON_SECRET='abc123'",
      "PORT=3000 # le port de prod",
      "pas une ligne de variable",
      "=valeur-sans-cle",
    ].join("\n"),
  );
  assert.equal(v.get("NEXT_PUBLIC_APP_URL"), "https://quiz.tipote.com");
  assert.equal(v.get("SMTP_FROM"), "Tiquiz <hello@tipote.com>");
  assert.equal(v.get("CRON_SECRET"), "abc123");
  assert.equal(v.get("PORT"), "3000");
  assert.equal(v.size, 4);
});

test("une URL avec un # garde son #", () => {
  const v = parseEnvFile("UN_LIEN=https://exemple.fr/page#ancre\n");
  assert.equal(v.get("UN_LIEN"), "https://exemple.fr/page#ancre");
});
