// scripts/import-pepites-from-zip.cjs
// Usage:
//   node scripts/import-pepites-from-zip.cjs ./pépites.zip
//
// Requiert:
// - NEXT_PUBLIC_SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Le titre = nom du fichier .txt (sans extension), EXACT
// Le body = contenu du fichier, EXACT (aucune reformulation)

require("dotenv").config({ path: ".env.production.local" });
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const JSZip = require("jszip");

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isTxtEntry(p) {
  const s = String(p || "").toLowerCase();
  return s.endsWith(".txt");
}

function normalizeEntryPath(p) {
  return String(p || "").replace(/\\/g, "/");
}

async function main() {
  const zipPathArg = process.argv[2] || "./pépites.zip";
  const zipPath = path.resolve(process.cwd(), zipPathArg);

  if (!fs.existsSync(zipPath)) {
    throw new Error(`Zip introuvable: ${zipPath}`);
  }

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);

  const entries = Object.keys(zip.files)
    .map((k) => normalizeEntryPath(k))
    .filter((k) => !zip.files[k]?.dir)
    .filter(isTxtEntry);

  // On supporte ton zip qui contient "insights/*.txt"
  // (et on reste souple si tu changes le dossier)
  const txtEntries = entries.filter((p) => p.includes("/insights/") || !p.includes("/"));

  if (txtEntries.length === 0) {
    throw new Error(
      `Aucun .txt trouvé dans le zip (attendu: insights/*.txt). Entrées: ${entries.slice(0, 10).join(", ")}`
    );
  }

  const rows = [];
  for (const entryPath of txtEntries) {
    const fileObj = zip.file(entryPath);
    if (!fileObj) continue;

    // title = filename sans extension (exact)
    const base = path.basename(entryPath);
    const title = base.replace(/\.txt$/i, "");

    // body = texte exact
    // NB: on garde tel quel (retours ligne inclus)
    const body = await fileObj.async("string");

    // skip vides
    if (!title.trim() || !body.trim()) continue;

    rows.push({ title, body });
  }

  // Upsert par title (si tu ré-importes, ça update le body)
  // Insert par batch pour éviter limites
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase
      .from("pepites")
      .upsert(batch, { onConflict: "title" });

    if (error) throw new Error(error.message);
    inserted += batch.length;
  }

  console.log(`[pepites] OK: ${inserted} pépites upsertées depuis ${path.basename(zipPath)}`);
}

main().catch((err) => {
  console.error("[pepites] ERROR:", err);
  process.exit(1);
});
