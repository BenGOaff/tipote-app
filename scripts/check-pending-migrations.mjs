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

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

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
  console.error("ENV manquantes : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

async function tableExists(table) {
  // HEAD + count: 0 row, juste le metadata
  const { error } = await supa.from(table).select("*", { count: "exact", head: true }).limit(0);
  if (!error) return { exists: true };
  if (error.code === "PGRST205" || /relation.*does not exist/i.test(error.message)) {
    return { exists: false, reason: error.message };
  }
  // Autre erreur (RLS bloque, etc.) : table existe probablement
  return { exists: true, warning: `${error.code} ${error.message}` };
}

async function columnExists(table, col) {
  const { error } = await supa.from(table).select(col).limit(1);
  if (!error) return { exists: true };
  if (error.code === "PGRST204" || /column.*does not exist/i.test(error.message)) {
    return { exists: false, reason: error.message };
  }
  if (error.code === "PGRST205" || /relation.*does not exist/i.test(error.message)) {
    return { exists: false, reason: `TABLE ABSENTE : ${error.message}` };
  }
  return { exists: true, warning: `${error.code} ${error.message}` };
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
