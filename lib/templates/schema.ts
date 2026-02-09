// lib/templates/schema.ts
import fs from "node:fs/promises";
import path from "node:path";

export type FieldSource = "user" | "ai" | "user_or_ai";
export type FieldFallback = "remove" | "generate" | "placeholder";
export type FieldInputType = "text" | "textarea" | "url" | "image_url";

export type InferredField =
  | {
      kind: "scalar";
      key: string;
      maxLength?: number;
      source?: FieldSource;
      fallback?: FieldFallback;
      inputType?: FieldInputType;
      label?: string;
      description?: string;
      required?: boolean;
    }
  | {
      kind: "array_scalar";
      key: string;
      minItems: number;
      maxItems: number;
      itemMaxLength?: number;
      source?: FieldSource;
      fallback?: FieldFallback;
      label?: string;
      description?: string;
      required?: boolean;
    }
  | {
      kind: "array_object";
      key: string;
      fields: Array<{ key: string; maxLength?: number; description?: string }>;
      minItems: number;
      maxItems: number;
      source?: FieldSource;
      fallback?: FieldFallback;
      label?: string;
      description?: string;
      required?: boolean;
    };

export type InferredTemplateSchema = {
  kind: "capture" | "vente";
  templateId: string;
  name?: string;
  description?: string;
  fields: InferredField[];
};

type JsonSchemaField = {
  key: string;
  type: string;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  itemMaxLength?: number;
  fields?: Array<{ key: string; type?: string; maxLength?: number; description?: string }>;
  itemSchema?: Record<string, { type?: string; maxLength?: number; description?: string }>;
  source?: string;
  fallback?: string;
  inputType?: string;
  label?: string;
  description?: string;
  required?: boolean;
};

type JsonSchemaFile = {
  kind?: "capture" | "vente";
  templateId?: string;
  name?: string;
  description?: string;
  fields?: JsonSchemaField[];
};

function safeId(v: string): string {
  return (v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
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

function safeSource(v: any): FieldSource | undefined {
  const s = String(v || "").trim();
  if (s === "user" || s === "ai" || s === "user_or_ai") return s;
  return undefined;
}

function safeFallback(v: any): FieldFallback | undefined {
  const s = String(v || "").trim();
  if (s === "remove" || s === "generate" || s === "placeholder") return s;
  return undefined;
}

function safeInputType(v: any): FieldInputType | undefined {
  const s = String(v || "").trim();
  if (s === "text" || s === "textarea" || s === "url" || s === "image_url") return s;
  return undefined;
}

function normalizeJsonSchema(kind: "capture" | "vente", templateId: string, json: JsonSchemaFile): InferredTemplateSchema {
  const out: InferredTemplateSchema = {
    kind,
    templateId,
    name: json.name || undefined,
    description: json.description || undefined,
    fields: [],
  };

  const fields = Array.isArray(json?.fields) ? json.fields : [];
  for (const f of fields) {
    if (!f || typeof f.key !== "string") continue;

    const key = String(f.key).trim();
    const type = String(f.type || "").trim();
    if (!key || !type) continue;

    const source = safeSource(f.source);
    const fallback = safeFallback(f.fallback);
    const inputType = safeInputType(f.inputType);
    const label = typeof f.label === "string" ? f.label : undefined;
    const description = typeof f.description === "string" ? f.description : undefined;
    const required = typeof f.required === "boolean" ? f.required : undefined;

    if (type === "string") {
      out.fields.push({
        kind: "scalar",
        key,
        maxLength: typeof f.maxLength === "number" ? f.maxLength : undefined,
        source,
        fallback,
        inputType,
        label,
        description,
        required,
      });
      continue;
    }

    if (type === "string[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof f.minItems === "number" ? Math.max(0, f.minItems) : guessed.min;
      const maxItems = typeof f.maxItems === "number" ? Math.max(minItems, f.maxItems) : guessed.max;
      const itemMaxLength = typeof f.itemMaxLength === "number" ? f.itemMaxLength : undefined;

      out.fields.push({ kind: "array_scalar", key, minItems, maxItems, itemMaxLength, source, fallback, label, description, required });
      continue;
    }

    if (type === "object[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof f.minItems === "number" ? Math.max(0, f.minItems) : guessed.min;
      const maxItems = typeof f.maxItems === "number" ? Math.max(minItems, f.maxItems) : guessed.max;

      type ObjField = { key: string; maxLength?: number; description?: string };
      let objFields: ObjField[] = [];

      // Support array format: fields: [{ key: "name", maxLength: 30 }]
      const fieldsArr = Array.isArray(f.fields) ? f.fields : [];
      if (fieldsArr.length > 0) {
        objFields = fieldsArr
          .map((x: any): ObjField => ({
            key: String(x?.key || "").trim(),
            maxLength: typeof x?.maxLength === "number" ? x.maxLength : undefined,
            description: typeof x?.description === "string" ? x.description : undefined,
          }))
          .filter((x) => Boolean(x.key));
      }
      // Support object format: itemSchema: { name: { type: "string", maxLength: 30 } }
      else if (isRecord(f.itemSchema)) {
        objFields = Object.entries(f.itemSchema)
          .map(([k, v]: [string, any]): ObjField => ({
            key: k,
            maxLength: typeof v?.maxLength === "number" ? v.maxLength : undefined,
            description: typeof v?.description === "string" ? v.description : undefined,
          }))
          .filter((x) => Boolean(x.key));
      }

      out.fields.push({ kind: "array_object", key, fields: objFields, minItems, maxItems, source, fallback, label, description, required });
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
    if (!fields.some((f) => f.key === key)) fields.push({ kind: "scalar", key });
  }

  const scalars = fields.filter((f) => f.kind === "scalar");
  const arrays = fields.filter((f) => f.kind !== "scalar");

  return { kind, templateId, fields: [...scalars, ...arrays] };
}

function fieldRuleLineMax(max?: number): string {
  if (!max || !Number.isFinite(max)) return "";
  return ` (max ${Math.max(10, Math.floor(max))} caract\u00e8res)`;
}

export function schemaToPrompt(schema: InferredTemplateSchema): string {
  const lines: string[] = [];
  lines.push(`TEMPLATE_KIND: ${schema.kind}`);
  lines.push(`TEMPLATE_ID: ${schema.templateId}`);
  lines.push("");
  lines.push("CHAMPS \u00c0 REMPLIR (JSON) :");

  for (const f of schema.fields) {
    // Skip user-provided fields — AI does not generate them
    if (f.source === "user") continue;

    if (f.kind === "scalar") {
      lines.push(`- ${f.key}: string${fieldRuleLineMax(f.maxLength)}`);
      continue;
    }
    if (f.kind === "array_scalar") {
      const lenInfo =
        typeof f.itemMaxLength === "number" ? ` (item max ${Math.floor(f.itemMaxLength)} caract\u00e8res)` : "";
      lines.push(`- ${f.key}: string[] (items: ${f.minItems}..${f.maxItems})${lenInfo}`);
      continue;
    }
    const inner = f.fields.map((x) => `${x.key}: string${fieldRuleLineMax(x.maxLength)}`).join("; ");
    lines.push(`- ${f.key}: { ${inner} }[] (items: ${f.minItems}..${f.maxItems})`);
  }

  lines.push("");
  lines.push("R\u00c8GLES DE SORTIE (STRICT) :");
  lines.push("- Retourne UNIQUEMENT un objet JSON valide (double quotes, pas de commentaire, pas de texte autour).");
  lines.push("- Respecte STRICTEMENT les cl\u00e9s ci-dessus (aucune cl\u00e9 en plus, aucune cl\u00e9 manquante).");
  lines.push('- Aucune valeur null/undefined : si tu n\'as pas l\'info, mets une string vide "".');
  lines.push("- Pas de markdown. Pas de balises HTML. Pas d'emojis.");
  lines.push("- Les strings : 1\u20132 phrases max, pas de sauts de ligne.");
  lines.push("- Les listes : items courts, concrets (id\u00e9alement 6\u201314 mots).");
  lines.push("- CTA : verbe d'action clair, 2\u20135 mots max.");
  lines.push("- Style : premium, direct, tr\u00e8s lisible. Z\u00e9ro blabla.");

  return lines.join("\n");
}