import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TPL = path.join(ROOT, "src", "templates");

function safeId(v) {
  return String(v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

function guessMaxLen(key) {
  const k = String(key || "").toLowerCase();
  if (k.includes("cta") || k.includes("button")) return 32;
  if (k.includes("badge") || k.includes("tag")) return 24;
  if (k.includes("title") || k === "h1" || k.includes("headline")) return 90;
  if (k.includes("subtitle") || k.includes("subhead")) return 140;
  if (k.includes("faq_q") || k.includes("question")) return 110;
  if (k.includes("faq_a") || k.includes("answer")) return 220;
  if (k.includes("desc") || k.includes("paragraph") || k.includes("copy")) return 220;
  return 160;
}

function guessItemMaxLen(key) {
  const k = String(key || "").toLowerCase();
  if (k.includes("faq")) return 220;
  if (k.includes("bullets") || k.includes("points") || k.includes("items")) return 90;
  return 120;
}

function guessCount(key) {
  const k = String(key || "").toLowerCase();
  if (k.includes("faq")) return { min: 6, max: 10 };
  if (k.includes("pricing") || k.includes("price")) return { min: 2, max: 4 };
  if (k.includes("bullets") || k.includes("points") || k.includes("items")) return { min: 4, max: 8 };
  if (k.includes("steps") || k.includes("program")) return { min: 4, max: 8 };
  return { min: 3, max: 7 };
}

function extractSections(html) {
  const out = [];
  const re = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let m;
  while ((m = re.exec(html))) out.push({ key: m[1], inner: m[2] });
  return out;
}

function extractKeys(fragment) {
  const keys = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(fragment))) keys.push(m[1]);
  return Array.from(new Set(keys));
}

function stripSections(html) {
  return html.replace(/\{\{#([a-zA-Z0-9_]+)\}\}[\s\S]*?\{\{\/\1\}\}/g, "");
}

async function genOne(kind, templateId) {
  const baseDir = path.join(TPL, kind, templateId);
  const schemaPath = path.join(baseDir, "content-schema.json");
  try {
    await fs.access(schemaPath);
    return { templateId, status: "skip" };
  } catch {}

  const layoutPath = path.join(baseDir, "layout.html");
  const layout = await fs.readFile(layoutPath, "utf-8");

  const sections = extractSections(layout);
  const fields = [];

  for (const s of sections) {
    const key = s.key;
    const hasDot = /\{\{\s*\.\s*\}\}/.test(s.inner);
    const cnt = guessCount(key);

    if (hasDot) {
      fields.push({
        key,
        type: "string[]",
        minItems: cnt.min,
        maxItems: cnt.max,
        itemMaxLength: guessItemMaxLen(key),
      });
    } else {
      const innerKeys = extractKeys(s.inner).filter((k) => k !== key);
      fields.push({
        key,
        type: "object[]",
        minItems: cnt.min,
        maxItems: cnt.max,
        fields: innerKeys.map((k) => ({ key: k, type: "string", maxLength: guessMaxLen(k) })),
      });
    }
  }

  const scalars = extractKeys(stripSections(layout));
  for (const k of scalars) {
    if (fields.some((f) => f.key === k)) continue;
    fields.push({ key: k, type: "string", maxLength: guessMaxLen(k) });
  }

  const json = { kind, templateId, fields };
  await fs.writeFile(schemaPath, JSON.stringify(json, null, 2), "utf-8");
  return { templateId, status: "written" };
}

async function main() {
  for (const kind of ["capture", "vente"]) {
    const dir = path.join(TPL, kind);
    const list = await fs.readdir(dir);
    for (const t of list) {
      const templateId = safeId(t);
      const res = await genOne(kind, templateId);
      if (res.status === "written") console.log(`[schema] ${kind}/${templateId} ✅`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
