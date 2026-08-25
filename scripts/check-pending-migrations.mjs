#!/usr/bin/env node
// scripts/check-pending-migrations.mjs (Tipote)
//
// Détecte AUTOMATIQUEMENT les migrations Supabase non appliquées en prod
// en lisant TOUS les fichiers .sql de supabase/migrations/ et en testant
// l'existence des colonnes/tables qu'ils déclarent.
//
// Différence avec check:schema (qui exige une liste hand-curated) :
//   - Aucune intervention manuelle requise : il suffit d'ajouter le .sql
//   - Détecte les migrations oubliées du check:schema (comme le drame du
//     022_quiz_events_meta sur Tiquiz : la colonne meta n'était pas dans
//     check:schema, donc la migration "en retard" passait sous le radar)
//
// Méthode (best-effort, déliberement conservateur pour éviter les faux
// positifs) :
//   - Parse "CREATE TABLE [IF NOT EXISTS] <nom>"           → vérifie table
//   - Parse "ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <col>" → vérifie col
//   - Ignore : INSERT, UPDATE, DROP, CREATE INDEX, CREATE POLICY, COMMENT,
//              CREATE TRIGGER, CREATE FUNCTION, GRANT, REVOKE, NOTIFY…
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/check-pending-migrations.mjs
//
// Exit code : 0 si tout est appliqué, 1 si au moins 1 migration en retard.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

// ── LE SCRIPT LIT LE `.env` LUI MÊME (Béné, 25 août 2026) ────────────
//
// "Ce code ne marche plus : ENV manquantes. J'ai rien changé dans le
// .env donc y'a pas de raison pour que ça marche plus."
//
// Elle a raison sur le `.env` : il n'a pas bougé. Ce script ne lisait
// QUE `process.env`, donc il exigeait que les variables soient déjà
// exportées dans le terminal. Ça marchait tant qu'on faisait
// `set -a; . .env; set +a` avant.
//
// C'est justement ce qu'on a INTERDIT le 22 août : cette commande
// exporte tout le fichier dans le shell, et c'est elle qui a croisé les
// deux bases Supabase des deux apps (une journée de panne). Le jour où
// elle a arrêté, le script a cessé de marcher. Rien n'est cassé : c'est
// la béquille qui a disparu.
//
// Le script de l'Atelier, lui, chargeait déjà son `.env` tout seul, et
// c'est pour ça qu'il marche encore. Un garde-fou qui ne protège qu'un
// des dépôts ne protège personne.
//
// ON PARSE, ON N'EXÉCUTE PAS. `. .env` demande à bash d'interpréter le
// fichier, et une clé d'API contenant un caractère spécial faisait
// échouer le chargement entier (drame de `login-link.mjs`). Ici on lit
// des lignes `CLE=valeur`, point.
//
// Et on n'ÉCRASE jamais une variable déjà présente : si quelqu'un a posé
// une valeur dans son terminal, c'est un choix, et le contredire en
// silence serait exactement le piège du 22 août dans l'autre sens.
function chargerDotenv() {
  for (const nom of [".env", ".env.local"]) {
    const p = join(__dirname, "..", nom);
    if (!existsSync(p)) continue;
    for (const brut of readFileSync(p, "utf8").split(/\r?\n/)) {
      const ligne = brut.trim();
      if (!ligne || ligne.startsWith("#")) continue;
      const m = ligne.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}
chargerDotenv();


const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_PROJECT_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  process.env.SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ENV manquantes : SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Cherchees dans le terminal, puis dans .env et .env.local a la racine du depot.",
  );
  process.exit(2);
}


/**
 * Parse un fichier SQL et extrait :
 *   - tables: Set<string>            (CREATE TABLE)
 *   - columnsByTable: Map<table, Set<col>>  (ALTER TABLE ADD COLUMN)
 *
 * Best-effort : on accepte schéma "public." optionnel, IF NOT EXISTS, et
 * on ignore tout ce qui n'est pas DDL structurel.
 */
function parseSql(sql) {
  // Strip /* … */ comments + lignes -- …
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");

  const tables = new Set();
  const columnsByTable = new Map();

  // CREATE TABLE [IF NOT EXISTS] [public.]<name>
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?(\w+)["']?/gi;
  for (const m of stripped.matchAll(createRe)) {
    tables.add(m[1].toLowerCase());
  }

  // ALTER TABLE [IF EXISTS] [public.]<table> … ADD COLUMN [IF NOT EXISTS] <col>
  // Un ALTER peut contenir plusieurs ADD COLUMN, on capture chaque ADD.
  const alterBlockRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?["']?(\w+)["']?([\s\S]*?);/gi;
  for (const m of stripped.matchAll(alterBlockRe)) {
    const table = m[1].toLowerCase();
    const body = m[2];
    const addColRe = /\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?["']?(\w+)["']?/gi;
    for (const c of body.matchAll(addColRe)) {
      const col = c[1].toLowerCase();
      // Filtrer mots-clés DDL qu'on aurait pu confondre avec un nom de col
      if (["constraint", "primary", "foreign", "unique", "check", "index"].includes(col)) continue;
      if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
      columnsByTable.get(table).add(col);
    }
  }

  return { tables, columnsByTable };
}

// ── PAS DE supabase-js DANS UN SCRIPT ───────────────────────────────
//
// `createClient` monte un client temps réel qui exige un WebSocket
// natif, absent de Node 20 : le script plantait avant de rien faire.
// C'est écrit noir sur blanc pour `login-link.mjs`, et ce script ne
// l'avait jamais appliqué. Deux appels REST suffisent.
const ENTETES = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

async function sonder(query) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${query}`, { headers: ENTETES });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

function tableAbsente(r) {
  return r.status === 404 || /PGRST205|could not find the table|relation .* does not exist/i.test(r.text);
}
function colonneAbsente(r) {
  return /PGRST204|42703|column .* does not exist|could not find the .* column/i.test(r.text);
}

async function tableExists(table) {
  const r = await sonder(`${table}?select=*&limit=1`);
  if (r.status === 200 || r.status === 206) return { exists: true };
  if (tableAbsente(r)) return { exists: false, reason: r.text.slice(0, 160) };
  // Autre erreur (RLS, etc.) : la table existe probablement.
  return { exists: true, warning: `${r.status} ${r.text.slice(0, 120)}` };
}

async function columnExists(table, col) {
  const r = await sonder(`${table}?select=${encodeURIComponent(col)}&limit=1`);
  if (r.status === 200 || r.status === 206) return { exists: true };
  if (tableAbsente(r)) return { exists: false, reason: "TABLE ABSENTE" };
  if (colonneAbsente(r)) return { exists: false, reason: r.text.slice(0, 160) };
  return { exists: true, warning: `${r.status} ${r.text.slice(0, 120)}` };
}

async function main() {
  console.log(`▶ check:migrations-pending Tipote (${SUPABASE_URL})`);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  console.log(`  ${files.length} fichiers .sql à scanner dans supabase/migrations/`);

  let totalChecks = 0;
  let totalFails = 0;
  const failedMigrations = [];

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const { tables, columnsByTable } = parseSql(sql);

    if (tables.size === 0 && columnsByTable.size === 0) {
      // Migration sans DDL structurelle détectable (trigger only, INSERT
      // seed, etc.) : skip silencieusement
      continue;
    }

    const fails = [];

    for (const t of tables) {
      totalChecks += 1;
      const r = await tableExists(t);
      if (!r.exists) fails.push(`TABLE ${t} ABSENTE : ${r.reason}`);
    }

    for (const [t, cols] of columnsByTable) {
      for (const c of cols) {
        totalChecks += 1;
        const r = await columnExists(t, c);
        if (!r.exists) fails.push(`${t}.${c} ABSENT : ${r.reason}`);
      }
    }

    if (fails.length > 0) {
      totalFails += fails.length;
      failedMigrations.push({ file, fails });
      console.log(`\n✗ ${file}`);
      for (const f of fails) console.log(`    ${f}`);
    } else {
      console.log(`✓ ${file}`);
    }
  }

  console.log("\n────────────────────────");
  console.log(`Résultat : ${totalChecks - totalFails} ✓ / ${totalFails} ✗ sur ${totalChecks} checks (${files.length} fichiers scannés)`);

  if (failedMigrations.length > 0) {
    console.log("\n🚨 MIGRATIONS À APPLIQUER SUR SUPABASE :");
    for (const m of failedMigrations) {
      console.log(`  - supabase/migrations/${m.file}`);
    }
    console.log("\nComment appliquer :");
    console.log("  1. https://supabase.com/dashboard → SQL Editor");
    console.log("  2. Coller le contenu de CHAQUE fichier ci-dessus, dans l'ordre");
    console.log("  3. Relancer ce script : tout doit passer ✓");
    process.exit(1);
  }
  console.log("Toutes les migrations détectables sont appliquées. ✓");
  process.exit(0);
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(2);
});
