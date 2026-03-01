// lib/templates/schema.ts
// Loads an explicit "content-schema.json" when available (source of truth),
// otherwise infers a minimal "contentData" schema from a Mustache-like HTML template.
// Used to make IA output fit the template (premium fidelity).
//
// 2026-02: Extended with source / fallback / label / inputType for schema-driven UI.

import fs from "node:fs/promises";
import path from "node:path";

// ---------- Source / fallback / inputType ----------

/** Who provides the value? */
export type FieldSource = "ai" | "user" | "user_or_ai";

/** What happens when the user does not provide the value? */
export type FieldFallback = "generate" | "remove" | "placeholder" | "empty";

/** Hint for the UI on which input widget to use */
export type FieldInputType = "text" | "textarea" | "image_url" | "url" | "email" | "select";

// ---------- Inferred field types ----------

export type InferredField =
  | {
      kind: "scalar";
      key: string;
      maxLength?: number;
      // extended attrs
      label?: string;
      description?: string;
      source?: FieldSource;
      fallback?: FieldFallback;
      inputType?: FieldInputType;
      required?: boolean;
    }
  | {
      kind: "array_scalar";
      key: string;
      minItems: number;
      maxItems: number;
      itemMaxLength?: number;
      // extended attrs
      label?: string;
      description?: string;
      source?: FieldSource;
      fallback?: FieldFallback;
      required?: boolean;
    }
  | {
      kind: "array_object";
      key: string;
      fields: Array<{ key: string; maxLength?: number; description?: string }>;
      minItems: number;
      maxItems: number;
      // extended attrs
      label?: string;
      description?: string;
      source?: FieldSource;
      fallback?: FieldFallback;
      required?: boolean;
    };

export type InferredTemplateSchema = {
  kind: "capture" | "vente";
  templateId: string;
  name?: string;
  description?: string;
  fields: InferredField[];
};

// ---------- JSON schema file types (content-schema.json) ----------

type JsonSchemaField = {
  key: string;
  type: string; // "string" | "string[]" | "object[]"
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  itemMaxLength?: number;
  // sub-fields (two formats supported)
  fields?: Array<{ key: string; type?: string; maxLength?: number; description?: string }>;
  itemSchema?: Record<string, { type?: string; maxLength?: number; description?: string }>;
  // extended
  label?: string;
  description?: string;
  source?: string;
  fallback?: string;
  inputType?: string;
  required?: boolean;
  intention?: string;
  examples?: string[];
};

type JsonSchemaFile = {
  kind?: "capture" | "vente";
  templateId?: string;
  name?: string;
  description?: string;
  fields?: JsonSchemaField[];
};

// ---------- Helpers ----------

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

function parseSource(v: any): FieldSource | undefined {
  const s = String(v || "").trim();
  if (s === "ai" || s === "user" || s === "user_or_ai") return s;
  return undefined;
}

function parseFallback(v: any): FieldFallback | undefined {
  const s = String(v || "").trim();
  if (s === "generate" || s === "remove" || s === "placeholder" || s === "empty") return s;
  return undefined;
}

function parseInputType(v: any): FieldInputType | undefined {
  const s = String(v || "").trim();
  if (s === "text" || s === "textarea" || s === "image_url" || s === "url" || s === "email" || s === "select") return s;
  return undefined;
}

// ---------- Normalize JSON schema from content-schema.json ----------

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

    // Common extended attributes
    const source = parseSource(f.source);
    const fallback = parseFallback(f.fallback);
    const inputType = parseInputType(f.inputType);
    const label = f.label || undefined;
    const description = f.description || undefined;
    const required = typeof f.required === "boolean" ? f.required : undefined;

    if (type === "string") {
      out.fields.push({
        kind: "scalar",
        key,
        maxLength: typeof f.maxLength === "number" ? f.maxLength : undefined,
        label,
        description,
        source,
        fallback,
        inputType,
        required,
      });
      continue;
    }

    if (type === "string[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof f.minItems === "number" ? Math.max(0, f.minItems) : guessed.min;
      const maxItems = typeof f.maxItems === "number" ? Math.max(minItems, f.maxItems) : guessed.max;
      const itemMaxLength = typeof f.itemMaxLength === "number" ? f.itemMaxLength : undefined;

      out.fields.push({
        kind: "array_scalar",
        key,
        minItems,
        maxItems,
        itemMaxLength,
        label,
        description,
        source,
        fallback,
        required,
      });
      continue;
    }

    if (type === "object[]") {
      const guessed = guessCountForArrayKey(key);
      const minItems = typeof f.minItems === "number" ? Math.max(0, f.minItems) : guessed.min;
      const maxItems = typeof f.maxItems === "number" ? Math.max(minItems, f.maxItems) : guessed.max;

      type ObjField = { key: string; maxLength?: number; description?: string };
      let objFields: ObjField[] = [];

      // Format 1: fields array — [{ key, maxLength, ... }]
      if (Array.isArray(f.fields) && f.fields.length > 0) {
        objFields = f.fields
          .map((x: any): ObjField => ({
            key: String(x?.key || "").trim(),
            maxLength: typeof x?.maxLength === "number" ? x.maxLength : undefined,
            description: x?.description || undefined,
          }))
          .filter((x) => Boolean(x.key));
      }
      // Format 2: itemSchema object — { fieldName: { type, maxLength, ... } }
      else if (f.itemSchema && typeof f.itemSchema === "object" && !Array.isArray(f.itemSchema)) {
        objFields = Object.entries(f.itemSchema)
          .map(([k, v]: [string, any]): ObjField => ({
            key: k.trim(),
            maxLength: typeof v?.maxLength === "number" ? v.maxLength : undefined,
            description: v?.description || undefined,
          }))
          .filter((x) => Boolean(x.key));
      }

      out.fields.push({
        kind: "array_object",
        key,
        fields: objFields,
        minItems,
        maxItems,
        label,
        description,
        source,
        fallback,
        required,
      });
      continue;
    }
  }

  // Sort: scalars first, then arrays
  const scalars = out.fields.filter((x) => x.kind === "scalar");
  const arrays = out.fields.filter((x) => x.kind !== "scalar");
  out.fields = [...scalars, ...arrays];

  return out;
}

// ---------- Public: infer template schema ----------

export async function inferTemplateSchema(params: {
  kind: "capture" | "vente";
  templateId: string;
}): Promise<InferredTemplateSchema> {
  const kind = safeId(params.kind) as "capture" | "vente";
  const templateId = safeId(params.templateId);

  const baseDir = path.join(process.cwd(), "src", "templates", kind, templateId);

  // Source of truth: content-schema.json
  const schemaPath = path.join(baseDir, "content-schema.json");
  try {
    const raw = await fs.readFile(schemaPath, "utf-8");
    const json = JSON.parse(raw) as JsonSchemaFile;
    const jsonKind = (json?.kind || kind) as "capture" | "vente";
    const jsonId = safeId(String(json?.templateId || templateId));
    return normalizeJsonSchema(jsonKind, jsonId || templateId, json);
  } catch {
    // fallback: infer from layout.html
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

// ---------- Public: schema → IA prompt ----------

function fieldRuleLineMax(max?: number): string {
  if (!max || !Number.isFinite(max)) return "";
  return ` (max ${Math.max(10, Math.floor(max))} caractères)`;
}

export function schemaToPrompt(schema: InferredTemplateSchema): string {
  const lines: string[] = [];
  lines.push(`TEMPLATE_KIND: ${schema.kind}`);
  lines.push(`TEMPLATE_ID: ${schema.templateId}`);
  if (schema.name) lines.push(`TEMPLATE_NAME: ${schema.name}`);
  if (schema.description) lines.push(`TEMPLATE_DESCRIPTION: ${schema.description}`);
  lines.push("");
  lines.push("CHAMPS À REMPLIR (JSON) :");
  lines.push("Pour chaque champ, rédige un VRAI texte de copywriting professionnel adapté à l'offre.");
  lines.push("NE RECOPIE JAMAIS les descriptions ou exemples ci-dessous — ils sont là pour te guider, pas pour être copiés.");
  lines.push("");

  for (const f of schema.fields) {
    // Skip fields that are purely user-provided (AI should NOT generate them)
    if (f.source === "user") continue;

    if (f.kind === "scalar") {
      let line = `- ${f.key}: string${fieldRuleLineMax(f.maxLength)}`;
      if (f.label) line += ` — ${f.label}`;
      lines.push(line);
      if (f.description) lines.push(`  → Objectif : ${f.description}`);
      continue;
    }
    if (f.kind === "array_scalar") {
      const lenInfo =
        typeof f.itemMaxLength === "number" ? ` (item max ${Math.floor(f.itemMaxLength)} caractères)` : "";
      let line = `- ${f.key}: string[] (items: ${f.minItems}..${f.maxItems})${lenInfo}`;
      if (f.label) line += ` — ${f.label}`;
      lines.push(line);
      if (f.description) lines.push(`  → Objectif : ${f.description}`);
      continue;
    }
    const inner = f.fields.map((x) => {
      let s = `${x.key}: string${fieldRuleLineMax(x.maxLength)}`;
      if (x.description) s += ` (${x.description})`;
      return s;
    }).join("; ");
    let line = `- ${f.key}: { ${inner} }[] (items: ${f.minItems}..${f.maxItems})`;
    if (f.label) line += ` — ${f.label}`;
    lines.push(line);
    if (f.description) lines.push(`  → Objectif : ${f.description}`);
  }

  lines.push("");
  lines.push("RÈGLES DE SORTIE (STRICT) :");
  lines.push("- Retourne UNIQUEMENT un objet JSON valide (double quotes, pas de commentaire, pas de texte autour).");
  lines.push("- Respecte STRICTEMENT les clés ci-dessus (aucune clé en plus, aucune clé manquante).");
  lines.push('- Aucune valeur null/undefined : si tu n\'as pas l\'info, mets une string vide "".');
  lines.push("- Pas de markdown. Pas de balises HTML. Pas d'emojis.");
  lines.push("- Les strings : 1–2 phrases max, pas de sauts de ligne.");
  lines.push("- Les listes : items courts, concrets (idéalement 6–14 mots).");
  lines.push("- CTA : verbe d'action clair, 2–5 mots max.");
  lines.push("- Style : premium, direct, très lisible. Zéro blabla.");
  lines.push("- INTERDIT : recopier les descriptions d'aide (\"Promesse de ton offre\", \"Décris ici\", etc.) — rédige le VRAI contenu de la page.");

  return lines.join("\n");
}

// ---------- Public: get user-facing fields for the adaptive UI ----------

export type UserFacingField = {
  key: string;
  kind: "scalar" | "array_scalar" | "array_object";
  label: string;
  description?: string;
  source: FieldSource;
  fallback: FieldFallback;
  inputType: FieldInputType;
  required: boolean;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  subFields?: Array<{ key: string; maxLength?: number; description?: string }>;
};

/**
 * Extracts the fields that the UI should display to the user.
 * - source="user" → always shown, user must fill
 * - source="user_or_ai" → shown with option to generate or remove
 * - source="ai" → hidden from user (AI generates)
 */
export function getUserFacingFields(schema: InferredTemplateSchema): UserFacingField[] {
  const result: UserFacingField[] = [];

  for (const f of schema.fields) {
    const source: FieldSource = f.source || "ai";
    // AI-only fields are not shown to the user
    if (source === "ai") continue;

    const fallback: FieldFallback = f.fallback || (source === "user" ? "placeholder" : "generate");
    const required = f.required ?? source === "user";

    const base = {
      key: f.key,
      kind: f.kind,
      label: f.label || f.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: f.description,
      source,
      fallback,
      required,
    };

    if (f.kind === "scalar") {
      const inputType: FieldInputType = f.inputType || (f.key.includes("url") ? "url" : f.key.includes("email") ? "email" : "text");
      result.push({
        ...base,
        inputType,
        maxLength: f.maxLength,
      });
    } else if (f.kind === "array_scalar") {
      result.push({
        ...base,
        inputType: "textarea" as FieldInputType,
        minItems: f.minItems,
        maxItems: f.maxItems,
      });
    } else if (f.kind === "array_object") {
      result.push({
        ...base,
        inputType: "textarea" as FieldInputType,
        minItems: f.minItems,
        maxItems: f.maxItems,
        subFields: f.fields,
      });
    }
  }

  return result;
}