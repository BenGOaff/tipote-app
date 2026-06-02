#!/usr/bin/env node
// scripts/check-schema.mjs (Tipote)
//
// Détecte les migrations Tipote "en retard" en prod en vérifiant que
// chaque colonne attendue EXISTE réellement. Né de la panne du 2 juin
// 2026 matin : `quizzes.survey_thanks_heading` manquait en prod (la
// migration 20260603_quizzes_survey_thanks.sql n'avait pas été
// appliquée) → tous les quizzes publics ont retourné 404 jusqu'au fix
// manuel.
//
// Mécanisme : pour chaque colonne attendue, on tente un SELECT qui
// l'utilise. PGRST204 (column not found) = migration en retard.
//
// READ-ONLY. À lancer après chaque déploiement, avant de pousser du
// nouveau code qui dépendrait de colonnes non encore présentes.
//
// Usage :
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/check-schema.mjs

import { createClient } from "@supabase/supabase-js";

// Tolère plusieurs noms de variables : Tipote utilise historiquement
// SUPABASE_SERVICE_ROLE (sans _KEY) dans .env.local, certains envs
// utilisent NEXT_PUBLIC_SUPABASE_URL côté browser-public.
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
  console.error("ENV manquantes pour check:schema.\n");
  if (!SUPABASE_URL) {
    console.error("URL Supabase introuvable. Variantes cherchées :");
    console.error("  SUPABASE_URL  |  NEXT_PUBLIC_SUPABASE_URL  |  SUPABASE_PROJECT_URL");
  }
  if (!SERVICE_ROLE_KEY) {
    console.error("Service-role key introuvable. Variantes cherchées :");
    console.error("  SUPABASE_SERVICE_ROLE_KEY  |  SUPABASE_SERVICE_ROLE");
    console.error("  SERVICE_ROLE_KEY  |  SUPABASE_SECRET_KEY");
  }
  // Aide debug : liste les variables SUPABASE* présentes (sans valeur).
  const supaVars = Object.keys(process.env)
    .filter((k) => /SUPABASE|SERVICE_ROLE/i.test(k))
    .sort();
  if (supaVars.length > 0) {
    console.error("\nVariables présentes dans l'env qui matchent SUPABASE/SERVICE_ROLE :");
    for (const k of supaVars) console.error(`  - ${k}`);
    console.error("\nSi l'un de ces noms est ta clé service-role, ajoute-le dans le fallback du script.");
  } else {
    console.error("\nAucune variable SUPABASE* dans l'env — as-tu bien fait `set -a; . .env.local; set +a` ?");
  }
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
const missing = [];

function ok(label) {
  pass += 1;
  console.log(`  ✓ ${label}`);
}
function ko(label, detail) {
  fail += 1;
  missing.push(`${label} — ${detail}`);
  console.log(`  ✗ ${label} — ${detail}`);
}

/**
 * Liste des structures DB attendues. Une entrée par migration récente
 * qui ajoute du SQL côté schéma. À chaque nouvelle migration, ajouter
 * ici les colonnes/tables qu'elle crée.
 */
const EXPECTED = [
  // ── Tracking : quiz_events (CAUSE PANNE STATS Tiquiz 18 mai → 2 juin) ─
  // Le /track INSERT direct dans quiz_events (meta + session_id). Si une
  // de ces colonnes manque (migration en retard), AUCUNE vue/start/
  // complete n'est trackée en silence → stats fausses. Sur Tipote la
  // table est créée d'un coup (20260521) avec meta+session_id, mais on
  // vérifie quand même par sécurité.
  {
    migration: "20260521_tracking_foundation",
    table: "quiz_events",
    columns: ["event_type", "meta", "session_id"],
  },
  {
    migration: "20260507_quiz_question_events",
    table: "quiz_question_events",
    columns: ["quiz_id", "question_index", "session_id", "event"],
  },

  // ── Quizzes : colonnes critiques pour le viewer public ──────────
  // (cf. PITFALL A : nouvelle colonne sur quizzes = 7 endroits à toucher)
  {
    migration: "20260603_quizzes_survey_thanks (LEÇON PANNE 2 JUIN MATIN)",
    table: "quizzes",
    columns: ["survey_thanks_heading", "survey_thanks_body"],
  },
  {
    migration: "20260603_quizzes_brand_logo_override",
    table: "quizzes",
    columns: ["brand_logo_url", "hide_brand_logo"],
  },
  {
    migration: "20260603_quizzes_capture_submit_text",
    table: "quizzes",
    columns: ["capture_submit_text"],
  },
  {
    migration: "20260603_quizzes_bonus_image_position",
    table: "quizzes",
    columns: ["bonus_image_position"],
  },

  // ── Business events foundation (juin 2026) ──────────────────────
  {
    migration: "20260604_business_events_foundation",
    table: "business_events",
    columns: ["id", "user_id", "kind", "payload", "source", "occurred_at"],
  },
  {
    migration: "20260604_business_events_foundation",
    table: "user_milestones",
    columns: ["id", "user_id", "milestone_key", "unlocked_at", "seen_at"],
  },

  // ── Survey AI analysis (juin 2026) ──────────────────────────────
  {
    migration: "20260606_survey_ai_analysis",
    table: "quizzes",
    columns: [
      "survey_ai_analysis",
      "survey_ai_analysis_at",
      "survey_ai_first_charged_at",
    ],
  },

  // ── Pixel defaults sur business_profiles ────────────────────────
  {
    migration: "20260530_business_profiles_pixel_defaults",
    table: "business_profiles",
    columns: [
      "default_meta_pixel_id",
      "default_ga4_measurement_id",
    ],
  },
  {
    migration: "20260531_business_profiles_capi_token",
    table: "business_profiles",
    columns: ["default_meta_capi_token"],
  },

  // ── Visual studio prefs (juin 2026) ─────────────────────────────
  // La migration crée 2 tables, pas de colonnes business_profiles.
  {
    migration: "20260602_visual_studio_prefs",
    table: "visual_studio_styles",
    columns: ["id"],
  },
  {
    migration: "20260602_visual_studio_prefs",
    table: "visual_studio_votes",
    columns: ["id"],
  },

  // ── Affiliate program (mai 2026) ────────────────────────────────
  // Table principale : `affiliates` (clé naturelle = sa).
  {
    migration: "20260525_affiliate_program",
    table: "affiliates",
    columns: ["sa", "email", "status"],
  },
];

async function checkTableColumns(migration, table, columns) {
  const label = `[${migration}] ${table} (${columns.length} col)`;
  try {
    const { error } = await supa.from(table).select(columns.join(",")).limit(1);
    if (error) {
      if (error.code === "PGRST204" || /column.*does not exist/i.test(error.message)) {
        ko(label, `MIGRATION EN RETARD : ${error.message}`);
        return;
      }
      if (error.code === "PGRST205" || /relation.*does not exist/i.test(error.message)) {
        ko(label, `TABLE ABSENTE : ${error.message}`);
        return;
      }
      ko(label, `erreur DB inattendue : ${error.code} ${error.message}`);
      return;
    }
    ok(label);
  } catch (e) {
    ko(label, `exception : ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log(`▶ Check schema Tipote (${SUPABASE_URL})`);
  console.log(`  ${EXPECTED.length} migrations à vérifier`);

  const byMigration = new Map();
  for (const e of EXPECTED) {
    if (!byMigration.has(e.migration)) byMigration.set(e.migration, []);
    byMigration.get(e.migration).push(e);
  }

  for (const [migration, entries] of byMigration) {
    console.log(`\n● ${migration}`);
    for (const e of entries) {
      await checkTableColumns(e.migration, e.table, e.columns);
    }
  }

  console.log("\n────────────────────────");
  console.log(`Résultat : ${pass} ✓ / ${fail} ✗`);
  if (fail > 0) {
    console.log("\nMIGRATIONS EN RETARD :");
    for (const m of missing) console.log("  - " + m);
    console.log("\nApplique-les manuellement sur Supabase Studio :");
    console.log("  https://supabase.com/dashboard → SQL Editor → coller le contenu");
    console.log("  des fichiers .sql concernés dans supabase/migrations/.");
    process.exit(1);
  }
  console.log("Toutes les migrations attendues sont appliquées.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(2);
});
