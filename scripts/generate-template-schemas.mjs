// scripts/generate-template-schemas.mjs
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = path.join(root, "src", "templates");

function safeId(v) {
  return String(v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

function guessCountForArrayKey(key) {
  const k = key.toLowerCase();
  if (k.includes("faq")) return { min: 5, max: 10 };
  if (k.includes("program")) return { min: 3, max: 7 };
  if (k.includes("bullets") || k.includes("items") || k.includes("points")) return { min: 3, max: 7 };
  if (k.includes("pricing") || k.includes("price") || k.includes("plans")) return { min: 2, max: 4 };
  return { min: 3, max: 6 };
}

function maxLenForKey(k) {
  const s = k.toLowerCase();
  if (s.includes("h1") || s.includes("headline") || s.includes("hero_title") || s.includes("title") || s.includes("titre"))
    return 90;
  if (s.includes("subtitle") || s.includes("subhead") || s.includes("hero_sub") || s.includes("tagline") || s.includes("lead"))
    return 140;
  if (s.includes("badge") || s.includes("label")) return 24;
  if (s.includes("cta") || s.includes("button") || s.includes("btn")) return 32;
  if (s.includes("price") || s.includes("prix")) return 40;
  if (s.includes("question")) return 100;
  if (s.includes("answer") || s.includes("reponse")) return 220;
  if (s.includes("desc") || s.includes("description") || s.includes("paragraph") || s.includes("text") || s.includes("content"))
    return 240;
  return 160;
}

function extractSections(template) {
  const sections = [];
  const re = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let m;
  while ((m = re.exec(template))) sections.push({ key: m[1], inner: m[2] });
  return sections;
}

function extractKeys(fragment) {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(fragment))) out.push(m[1]);
  return out;
}

function stripSections(template) {
  return template.replace(/\{\{#([a-zA-Z0-9_]+)\}\}[\s\S]*?\{\{\/\1\}\}/g, "");
}

async function buildSchema(kind, templateId) {
  const baseDir = path.join(base, kind, templateId);
  const layoutPath = path.join(baseDir, "layout.html");
  const layout = await fs.readFile(layoutPath, "utf-8");

  const sections = extractSections(layout);
  const fields = [];

  for (const s of sections) {
    const hasDot = /\{\{\s*\.\s*\}\}/.test(s.inner);
    const { min, max } = guessCountForArrayKey(s.key);

    if (hasDot) {
      fields.push({
        key: s.key,
        type: "string[]",
        minItems: min,
        maxItems: max,
        itemMaxLength: maxLenForKey(s.key),
      });
      continue;
    }

    const innerKeys = Array.from(new Set(extractKeys(s.inner))).filter((k) => k !== s.key);

    fields.push({
      key: s.key,
      type: "object[]",
      minItems: min,
      maxItems: max,
      fields: innerKeys.map((k) => ({
        key: k,
        type: "string",
        maxLength: maxLenForKey(k),
      })),
    });
  }

  const scalars = Array.from(new Set(extractKeys(stripSections(layout))));
  const existing = new Set(fields.map((f) => f.key));
  for (const k of scalars) {
    if (!existing.has(k)) {
      fields.push({ key: k, type: "string", maxLength: maxLenForKey(k) });
    }
  }

  return { kind, templateId, fields };
}

async function main() {
  for (const kind of ["capture", "vente"]) {
    const kindDir = path.join(base, kind);
    const items = await fs.readdir(kindDir).catch(() => []);
    for (const id of items) {
      const templateId = safeId(id);
      if (!templateId) continue;

      const baseDir = path.join(kindDir, templateId);
      const schemaPath = path.join(baseDir, "content-schema.json");

      try {
        await fs.access(schemaPath);
        continue; // already exists
      } catch {
        // create it
      }

      const schema = await buildSchema(kind, templateId);
      await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
      console.log(`[ok] ${kind}/${templateId}: content-schema.json created`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
