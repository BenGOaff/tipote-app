// app/api/templates/iterate/route.ts
// Iteration endpoint: takes instruction + current contentData/brandTokens and returns safe patches + next state.
// Auth: requires Supabase session (server) to prevent abuse.
// IMPORTANT: never edits HTML. Only updates structured data.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Kind = "capture" | "vente";

const PatchSchema = z.object({
  op: z.enum(["set", "unset"]),
  // Examples:
  // - "hero_title"
  // - "bullets.2"
  // - "features.0.t"
  // - "faq_items.1.question"
  // - "brandTokens.accent"
  path: z.string().min(1),
  value: z.any().optional(),
});

const InputSchema = z.object({
  instruction: z.string().min(3),
  templateId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  kind: z.enum(["capture", "vente"]),
  contentData: z.record(z.any()),
  brandTokens: z.record(z.any()).optional().nullable(),
});

const OutputSchema = z.object({
  patches: z.array(PatchSchema),
  explanation: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

const CONTENT_WHITELIST: Record<Kind, string[]> = {
  capture: [
    "hero_pretitle",
    "hero_badge",
    "hero_kicker",
    "hero_title",
    "hero_subtitle",
    "bullets",
    "features",
    "steps",
    "cta_text",
    "reassurance_text",
    "side_badge",
    "key_number",
  ],
  vente: ["hero_title", "hero_subtitle", "hero_bullets", "cta_main", "faq_items"],
};

const BRANDTOKENS_WHITELIST = ["accent", "headingFont", "bodyFont"];

function isPathAllowed(path: string, kind: Kind): boolean {
  if (path.startsWith("brandTokens.")) {
    const key = path.slice("brandTokens.".length).split(".")[0];
    return BRANDTOKENS_WHITELIST.includes(key);
  }
  const root = path.split(".")[0];
  return CONTENT_WHITELIST[kind].includes(root);
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function applyPatches(args: {
  contentData: Record<string, any>;
  brandTokens: Record<string, any>;
  patches: Array<z.infer<typeof PatchSchema>>;
}) {
  const nextContent = structuredClone(args.contentData || {});
  const nextBrand = structuredClone(args.brandTokens || {});

  for (const patch of args.patches) {
    const isBrand = patch.path.startsWith("brandTokens.");
    const target = isBrand ? nextBrand : nextContent;

    const cleanPath = isBrand ? patch.path.replace(/^brandTokens\./, "") : patch.path;
    const keys = cleanPath.split(".").filter(Boolean);

    if (!keys.length) continue;

    let obj: any = target;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const nextK = keys[i + 1];

      // create container (array vs object) if needed
      if (obj[k] == null) {
        obj[k] = /^\d+$/.test(nextK) ? [] : {};
      }
      obj = obj[k];
    }

    const last = keys[keys.length - 1];

    if (patch.op === "unset") {
      if (Array.isArray(obj) && /^\d+$/.test(last)) {
        const idx = Number(last);
        if (Number.isFinite(idx)) obj.splice(idx, 1);
      } else if (isPlainObject(obj)) {
        delete obj[last];
      }
      continue;
    }

    if (Array.isArray(obj) && /^\d+$/.test(last)) {
      const idx = Number(last);
      if (Number.isFinite(idx)) obj[idx] = patch.value;
    } else {
      obj[last] = patch.value;
    }
  }

  return { nextContentData: nextContent, nextBrandTokens: nextBrand };
}

async function callClaudeOwner(args: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey =
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    "";

  if (!apiKey) {
    throw new Error("missing_owner_api_key");
  }

  const model =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 1600,
      temperature: typeof args.temperature === "number" ? args.temperature : 0.2,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Claude error (${res.status})`;
    throw new Error(msg);
  }

  const text =
    json?.content?.find?.((c: any) => c?.type === "text")?.text ||
    json?.content?.[0]?.text ||
    "";

  return (text || "").trim();
}

export async function POST(req: Request) {
  // Auth (same pattern as /api/templates/render)
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { instruction, templateId, variantId, kind, contentData } = parsed.data;

  const brandTokens =
    parsed.data.brandTokens && typeof parsed.data.brandTokens === "object"
      ? (parsed.data.brandTokens as Record<string, any>)
      : {};

  const system = `Tu es un éditeur de templates HTML Systeme.io pour Tipote.
Règles absolues :
- Tu NE modifies JAMAIS de HTML.
- Tu proposes uniquement des PATCHS STRUCTURÉS sur contentData et brandTokens.
- Tu réponds uniquement en JSON valide (pas de texte autour).
- Chaque patch = { op: "set" | "unset", path: string, value?: any }.
- Tu n'utilises QUE des paths autorisés.
- Si une demande est impossible, réponds avec patches:[] + warnings.

Champs autorisés:
- contentData.${CONTENT_WHITELIST[kind].join(", contentData.")}
- brandTokens.${BRANDTOKENS_WHITELIST.join(", brandTokens.")}`;

  const user = `TEMPLATE: ${templateId}
VARIANT: ${variantId || "default"}
TYPE: ${kind}

ETAT ACTUEL:
${JSON.stringify({ contentData, brandTokens }, null, 2)}

DEMANDE UTILISATEUR:
"${instruction}"

Réponds uniquement avec:
{
  "patches": Patch[],
  "explanation"?: string,
  "warnings"?: string[]
}`;

  let raw = "";
  try {
    if (openai) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });

      raw = completion.choices?.[0]?.message?.content?.trim() || "";
    } else {
      raw = await callClaudeOwner({ system, user, temperature: 0.2, maxTokens: 1600 });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "LLM call failed" },
      { status: 500 }
    );
  }

  let out: z.infer<typeof OutputSchema>;
  try {
    out = OutputSchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      { error: "Invalid AI response", raw },
      { status: 500 }
    );
  }

  const safePatches = (out.patches || []).filter((p) => isPathAllowed(p.path, kind));

  const applied = applyPatches({
    contentData: contentData as any,
    brandTokens: brandTokens as any,
    patches: safePatches,
  });

  return NextResponse.json({
    patches: safePatches,
    explanation: out.explanation,
    warnings: out.warnings,
    nextContentData: applied.nextContentData,
    nextBrandTokens: applied.nextBrandTokens,
  });
}
