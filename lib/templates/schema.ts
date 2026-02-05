// lib/templates/schema.ts
// Loads an explicit "content-schema.json" when available (source of truth),
// otherwise infers a minimal "contentData" schema from a Mustache-like HTML template.
// Used to make IA output fit the template (premium fidelity).

import fs from "node:fs/promises";
import path from "node:path";

export type InferredField =
  | { kind: "scalar"; key: string; maxLength?: number }
  | { kind: "array_scalar"; key: string; minItems: number; maxItems: number; itemMaxLength?: number }
  | {
      kind: "array_object";
      key: string;
      fields: Array<{ key: string; maxLength?: number }>;
      minItems: number;
      maxItems: number;
    };

export type InferredTemplateSchema = {
  kind: "capture" | "vente";
  templateId: string;
  fields: InferredField[];
};

type JsonSchemaField =
  | { key: string; type: "string"; maxLength?: number }
  | { key: string; type: "string[]"; minItems?: number; maxItems?: number; itemMaxLength?: number }
  | {
      key: string;
      type: "object[]";
      minItems?: number;
      maxItems?: number;
      fields?: Array<{ key: string; type?: "string"; maxLength?: number }>;
    };

type JsonSchemaFile = {
  kind?: "capture" | "vente";
  templateId?: string;
  fields?: JsonSchemaField[];
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
  if (k.includes("bullets") || k.includes("items") || k.includes("points")) return { min: 3, max: 7 };
  if (k.includes("pricing") || k.includes("price")) return { min: 2, max: 4 };
  return { min: 3, max: 6 };
}

function extractSections(template: string) {
  const sections: { key: string; inner: string }[] = [];
  const re = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) sections.push({ key: m[1], inner: m[2] });
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

function normalizeJsonSchema(kind: "capture" | "vente", templateId: string, json: JsonSchemaFile): InferredTemplateSchema {
  const out: InferredTemplateSchema = { kind, templateId, fields: [] };

  const fields = Array.isArray(json?.fields) ? json.fields : [];
  for (const f of fields) {
    if (!f || typeof (f as any).key !== "string") continue;

    const key = String((f as any).key).trim();
    const type = String((f as any).type || "").trim();
    if (!key || !type) continue;

    if (type === "string") {
      out.fields.push({
        kind: "scalar",
        key,
        maxLength: typeof (f as any).maxLength === "number" ? (f as any).maxLength : undefined,
      });
      continue;
    }

    if (type === "string[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof (f as any).minItems === "number" ? Math.max(0, (f as any).minItems) : guessed.min;
      const maxItems =
        typeof (f as any).maxItems === "number" ? Math.max(minItems, (f as any).maxItems) : guessed.max;
      const itemMaxLength = typeof (f as any).itemMaxLength === "number" ? (f as any).itemMaxLength : undefined;

      out.fields.push({ kind: "array_scalar", key, minItems, maxItems, itemMaxLength });
      continue;
    }

    if (type === "object[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof (f as any).minItems === "number" ? Math.max(0, (f as any).minItems) : guessed.min;
      const maxItems =
        typeof (f as any).maxItems === "number" ? Math.max(minItems, (f as any).maxItems) : guessed.max;

        
        type ObjField = { key: string; maxLength?: number };
        const inner: any[] = Array.isArray((f as any).fields) ? (f as any).fields : [];
        const objFields: ObjField[] = inner
          .map((x: any): ObjField => ({
            key: String(x?.key || "").trim(),
            maxLength: typeof x?.maxLength === "number" ? x.maxLength : undefined,
          }))
          .filter((x: ObjField) => Boolean(x.key));


              out.fields.push({ kind: "array_object", key, fields: objFields, minItems, maxItems });
              continue;
            }
          }

  const scalars = out.fields.filter((x) => x.kind === "scalar");
  const arrays = out.fields.filter((x) => x.kind !== "scalar");
  out.fields = [...scalars, ...arrays];

  return out;
}

export async function inferTemplateSchema(params: {
  kind: "capture" | "vente";
  templateId: string;
}): Promise<InferredTemplateSchema> {
  const kind = safeId(params.kind) as "capture" | "vente";
  const templateId = safeId(params.templateId);

  const baseDir = path.join(process.cwd(), "src", "templates", kind, templateId);

  // ✅ Source de vérité si fourni
  const schemaPath = path.join(baseDir, "content-schema.json");
  try {
    const raw = await fs.readFile(schemaPath, "utf-8");
    const json = JSON.parse(raw) as JsonSchemaFile;
    const jsonKind = (json?.kind || kind) as "capture" | "vente";
    const jsonId = safeId(String(json?.templateId || templateId));
    return normalizeJsonSchema(jsonKind, jsonId || templateId, json);
  } catch {
    // fallback inference
  }

  const layoutPath = path.join(baseDir, "layout.html");
  const layout = await fs.readFile(layoutPath, "utf-8");

  const sections = extractSections(layout);
  const fields: InferredField[] = [];

  for (const s of sections) {
    const key = s.key;
    const hasDot = /\{\{\s*\.\s*\}\}/.test(s.inner);

    if (hasDot) {
      const { min, max } = guessCountForArrayKey(key);
      fields.push({ kind: "array_scalar", key, minItems: min, maxItems: max });
      continue;
    }

    const innerKeys = uniq(extractMustacheKeys(s.inner)).filter((k) => k !== key);
    const { min, max } = guessCountForArrayKey(key);

    fields.push({
      kind: "array_object",
      key,
      fields: innerKeys.map((k) => ({ key: k })),
      minItems: min,
      maxItems: max,
    });
  }

  const withoutSections = stripSections(layout);
  const scalarKeys = uniq(extractMustacheKeys(withoutSections));

  for (const key of scalarKeys) {
    if (!fields.some((f) => (f as any).key === key)) fields.push({ kind: "scalar", key });
  }

  const scalars = fields.filter((f) => f.kind === "scalar");
  const arrays = fields.filter((f) => f.kind !== "scalar");

  return { kind, templateId, fields: [...scalars, ...arrays] };
}

function fieldRuleLineMax(max?: number): string {
  if (!max || !Number.isFinite(max)) return "";
  return ` (max ${Math.max(10, Math.floor(max))} caractères)`;
}

export function schemaToPrompt(schema: InferredTemplateSchema): string {
  const lines: string[] = [];
  lines.push(`TEMPLATE_KIND: ${schema.kind}`);
  lines.push(`TEMPLATE_ID: ${schema.templateId}`);
  lines.push("");
  lines.push("CHAMPS À REMPLIR (JSON) :");

  for (const f of schema.fields) {
    if (f.kind === "scalar") {
      lines.push(`- ${f.key}: string${fieldRuleLineMax(f.maxLength)}`);
      continue;
    }
    if (f.kind === "array_scalar") {
      const lenInfo =
        typeof f.itemMaxLength === "number" ? ` (item max ${Math.floor(f.itemMaxLength)} caractères)` : "";
      lines.push(`- ${f.key}: string[] (items: ${f.minItems}..${f.maxItems})${lenInfo}`);
      continue;
    }
    const inner = f.fields.map((x) => `${x.key}: string${fieldRuleLineMax(x.maxLength)}`).join("; ");
    lines.push(`- ${f.key}: { ${inner} }[] (items: ${f.minItems}..${f.maxItems})`);
  }

  lines.push("");
  lines.push("RÈGLES DE SORTIE (STRICT) :");
  lines.push("- Retourne UNIQUEMENT un objet JSON valide (double quotes, pas de commentaire, pas de texte autour).");
  lines.push("- Respecte STRICTEMENT les clés ci-dessus (aucune clé en plus, aucune clé manquante).");
  lines.push("- Aucune valeur null/undefined : si tu n'as pas l'info, mets une string vide \"\".");
  lines.push("- Pas de markdown. Pas de balises HTML. Pas d'emojis.");
  lines.push("- Les strings : 1–2 phrases max, pas de sauts de ligne.");
  lines.push("- Les listes : items courts, concrets (idéalement 6–14 mots).");
  lines.push("- CTA : verbe d'action clair, 2–5 mots max.");
  lines.push("- Style : premium, direct, très lisible. Zéro blabla.");

  return lines.join("\\n");
}
