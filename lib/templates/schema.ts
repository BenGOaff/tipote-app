// lib/templates/schema.ts
// Infers a minimal "contentData" schema from a Mustache-like HTML template.
// Used to make IA output fit the template (premium fidelity).

import fs from "node:fs/promises";
import path from "node:path";

export type InferredField =
  | { kind: "scalar"; key: string }
  | { kind: "array_scalar"; key: string; minItems: number; maxItems: number }
  | {
      kind: "array_object";
      key: string;
      fields: string[];
      minItems: number;
      maxItems: number;
    };

export type InferredTemplateSchema = {
  kind: "capture" | "vente";
  templateId: string;
  fields: InferredField[];
};

function safeId(v: string): string {
  return (v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function guessCountForArrayKey(key: string): { min: number; max: number } {
  const k = key.toLowerCase();

  if (k.includes("faq")) return { min: 5, max: 10 };
  if (k.includes("program")) return { min: 3, max: 7 };
  if (k.includes("bullets") || k.includes("items") || k.includes("points"))
    return { min: 3, max: 7 };
  if (k.includes("pricing") || k.includes("price")) return { min: 2, max: 4 };
  return { min: 3, max: 6 };
}

function extractSections(template: string) {
  // Match {{#key}} ... {{/key}}
  const sections: { key: string; inner: string }[] = [];
  const re = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    sections.push({ key: m[1], inner: m[2] });
  }
  return sections;
}

function extractMustacheKeys(fragment: string) {
  const keys: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) keys.push(m[1]);
  return keys;
}

function stripSections(template: string): string {
  return template.replace(/\{\{#([a-zA-Z0-9_]+)\}\}[\s\S]*?\{\{\/\1\}\}/g, "");
}

export async function inferTemplateSchema(params: {
  kind: "capture" | "vente";
  templateId: string;
}): Promise<InferredTemplateSchema> {
  const kind = safeId(params.kind) as "capture" | "vente";
  const templateId = safeId(params.templateId);

  const baseDir = path.join(process.cwd(), "src", "templates", kind, templateId);
  const layoutPath = path.join(baseDir, "layout.html");

  const layout = await fs.readFile(layoutPath, "utf-8");

  const sections = extractSections(layout);

  const fields: InferredField[] = [];

  // Arrays from sections
  for (const s of sections) {
    const key = s.key;
    const hasDot = /\{\{\s*\.\s*\}\}/.test(s.inner);

    if (hasDot) {
      const { min, max } = guessCountForArrayKey(key);
      fields.push({
        kind: "array_scalar",
        key,
        minItems: min,
        maxItems: max,
      });
      continue;
    }

    // object array: extract inner scalar keys
    const innerKeys = uniq(extractMustacheKeys(s.inner)).filter((k) => k !== key);
    const { min, max } = guessCountForArrayKey(key);
    fields.push({
      kind: "array_object",
      key,
      fields: innerKeys,
      minItems: min,
      maxItems: max,
    });
  }

  // Scalars outside sections
  const withoutSections = stripSections(layout);
  const scalarKeys = uniq(extractMustacheKeys(withoutSections));

  for (const key of scalarKeys) {
    if (!fields.some((f) => f.key === key)) {
      fields.push({ kind: "scalar", key });
    }
  }

  // Stable ordering: scalars first then arrays (nice for prompts)
  const scalars = fields.filter((f) => f.kind === "scalar");
  const arrays = fields.filter((f) => f.kind !== "scalar");

  return {
    kind,
    templateId,
    fields: [...scalars, ...arrays],
  };
}

export function schemaToPrompt(schema: InferredTemplateSchema): string {
  const lines: string[] = [];
  lines.push(`TEMPLATE_KIND: ${schema.kind}`);
  lines.push(`TEMPLATE_ID: ${schema.templateId}`);
  lines.push("");
  lines.push("CHAMPS À REMPLIR (JSON) :");

  for (const f of schema.fields) {
    if (f.kind === "scalar") {
      lines.push(`- ${f.key}: string`);
      continue;
    }
    if (f.kind === "array_scalar") {
      lines.push(`- ${f.key}: string[] (items: ${f.minItems}..${f.maxItems})`);
      continue;
    }
    lines.push(
      `- ${f.key}: { ${f.fields.map((k) => `${k}: string`).join("; ")} }[] (items: ${f.minItems}..${f.maxItems})`,
    );
  }

  lines.push("");
  lines.push("RÈGLES DE QUALITÉ :");
  lines.push("- Respecte STRICTEMENT les clés ci-dessus (aucune clé en plus, aucune clé manquante).");
  lines.push("- Textes PREMIUM, concis, très lisibles, sans blabla.");
  lines.push("- Pas de markdown. Pas de balises HTML. Pas de guillemets typographiques bizarres.");
  lines.push("- Les titles: courts et punchy. Les paragraphs: 1-2 phrases max.");
  lines.push("- Les listes: items courts (idéalement 6-14 mots).");
  lines.push("- Retourne UNIQUEMENT le JSON final (objet).");

  return lines.join("\n");
}
