// app/api/templates/iterate/route.ts
// Iteration endpoint: takes instruction + current contentData/brandTokens and returns safe patches + next state.
// Auth: requires Supabase session (server) to prevent abuse.
// IMPORTANT: never edits HTML. Only updates structured data.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getOwnerOpenAI, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Kind = "capture" | "vente";

type CaptureTemplateId =
  | "capture-01"
  | "capture-02"
  | "capture-03"
  | "capture-04"
  | "capture-05";

type SaleTemplateId =
  | "sale-01"
  | "sale-02"
  | "sale-03"
  | "sale-04"
  | "sale-05"
  | "sale-06"
  | "sale-07"
  | "sale-08"
  | "sale-09"
  | "sale-10"
  | "sale-11"
  | "sale-12";

type TemplateId = CaptureTemplateId | SaleTemplateId;

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
  templateId: z.enum([
    "capture-01",
    "capture-02",
    "capture-03",
    "capture-04",
    "capture-05",
    "sale-01",
    "sale-02",
    "sale-03",
    "sale-04",
    "sale-05",
    "sale-06",
    "sale-07",
    "sale-08",
    "sale-09",
    "sale-10",
    "sale-11",
    "sale-12",
  ]),
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

function isPathAllowed(path: string, kind: Kind) {
  const p = String(path || "").trim();
  if (!p) return false;

  if (p.startsWith("brandTokens.")) {
    const key = p.replace("brandTokens.", "").split(".")[0] || "";
    return BRANDTOKENS_WHITELIST.includes(key);
  }

  const root = p.split(".")[0] || "";
  return CONTENT_WHITELIST[kind].includes(root);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

function setByPath(obj: any, path: string, value: any) {
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextK = parts[i + 1];
    const isIndex = /^\d+$/.test(nextK);
    if (cur[k] == null) cur[k] = isIndex ? [] : {};
    cur = cur[k];
  }

  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    const idx = Number(last);
    if (!Array.isArray(cur)) return;
    cur[idx] = value;
    return;
  }

  cur[last] = value;
}

function unsetByPath(obj: any, path: string) {
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur == null) return;
    cur = cur[k];
  }

  const last = parts[parts.length - 1];
  if (cur == null) return;

  if (/^\d+$/.test(last)) {
    const idx = Number(last);
    if (!Array.isArray(cur)) return;
    cur.splice(idx, 1);
    return;
  }

  delete cur[last];
}

function applyPatches(params: {
  contentData: Record<string, any>;
  brandTokens: Record<string, any>;
  patches: Array<{ op: "set" | "unset"; path: string; value?: any }>;
}) {
  const contentData = deepClone(params.contentData || {});
  const brandTokens = deepClone(params.brandTokens || {});
  const patches = Array.isArray(params.patches) ? params.patches : [];

  for (const p of patches) {
    const path = String(p.path || "");
    if (!path) continue;

    if (path.startsWith("brandTokens.")) {
      const btPath = path.replace("brandTokens.", "");
      if (p.op === "unset") unsetByPath(brandTokens, btPath);
      else setByPath(brandTokens, btPath, p.value);
      continue;
    }

    if (p.op === "unset") unsetByPath(contentData, path);
    else setByPath(contentData, path, p.value);
  }

  return { nextContentData: contentData, nextBrandTokens: brandTokens };
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOwnerOpenAI();
  if (!openai) {
    return NextResponse.json(
      {
        error:
          "OpenAI non configuré (OPENAI_API_KEY_OWNER manquant). Impossible d’itérer le template.",
      },
      { status: 500 }
    );
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

  // ✅ Template whitelist coherence: templateId must match kind
  const isCaptureTemplate = String(templateId).startsWith("capture-");
  if (
    (kind === "capture" && !isCaptureTemplate) ||
    (kind === "vente" && isCaptureTemplate)
  ) {
    return NextResponse.json(
      { error: "Template/kind mismatch" },
      { status: 400 }
    );
  }

  // ✅ Credits gating (each iteration costs 0.5)
  const creditCost = 0.5;
  const balance = await ensureUserCredits(session.user.id);
  if (balance.total_remaining < creditCost) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_CREDITS",
        error:
          "Crédits insuffisants pour appliquer un changement (0,5 crédit). Recharge ou upgrade pour continuer.",
        balance,
        upgrade_url: "/settings?tab=billing",
      },
      { status: 402 }
    );
  }

  const brandTokens = parsed.data.brandTokens ?? {};

  const system = [
    "Tu es un assistant d’édition de templates Systeme.io.",
    "Tu ne modifies jamais le HTML.",
    "Tu produis UNIQUEMENT un JSON qui respecte ce schéma :",
    JSON.stringify(
      {
        patches: [{ op: "set", path: "hero_title", value: "Nouveau titre" }],
        explanation: "Phrase courte expliquant ce qui a été fait.",
        warnings: ["Optionnel : avertissements"],
      },
      null,
      2
    ),
    "",
    "Règles OBLIGATOIRES :",
    "- Réponds strictement en JSON valide (pas de markdown, pas de texte autour).",
    `- kind = ${kind}`,
    `- templateId = ${templateId}`,
    `- variantId = ${variantId || ""}`,
    "",
    "WHITELIST paths autorisés :",
    `- contentData roots: ${CONTENT_WHITELIST[kind].join(", ")}`,
    `- brandTokens roots: ${BRANDTOKENS_WHITELIST.join(", ")}`,
    "",
    "Interdictions :",
    "- Ne propose pas de nouveaux champs hors whitelist.",
    "- Ne modifie pas des clés non autorisées.",
    "- Si l’instruction demande quelque chose hors scope, renvoie patches=[] et explique.",
  ].join("\n");

  const user = [
    "INSTRUCTION USER :",
    instruction,
    "",
    "ETAT ACTUEL (contentData) :",
    JSON.stringify(contentData || {}, null, 2),
    "",
    "ETAT ACTUEL (brandTokens) :",
    JSON.stringify(brandTokens || {}, null, 2),
  ].join("\n");

  let raw = "";
  try {
    const completion = await openai.chat.completions.create({
      ...cachingParams("template_iterate"),
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 4000,
    } as any);

    raw = completion.choices?.[0]?.message?.content?.trim() || "";
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

  const safePatches = (out.patches || []).filter((p) =>
    isPathAllowed(p.path, kind)
  );

  const applied = applyPatches({
    contentData: contentData as any,
    brandTokens: brandTokens as any,
    patches: safePatches,
  });

  // ✅ Consume credits only after a valid iteration response
  try {
    await consumeCredits(session.user.id, creditCost, {
      kind: "template_iterate",
      template_id: templateId,
      variant_id: variantId || null,
      template_kind: kind,
      patches_count: safePatches.length,
    });
  } catch (e: any) {
    const code = e?.code || e?.message;
    if (code === "NO_CREDITS") {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_CREDITS",
          error: "Crédits insuffisants. Recharge ou upgrade pour continuer.",
          upgrade_url: "/settings?tab=billing",
        },
        { status: 402 }
      );
    }
  }

  return NextResponse.json({
    patches: safePatches,
    explanation: out.explanation,
    warnings: out.warnings,
    nextContentData: applied.nextContentData,
    nextBrandTokens: applied.nextBrandTokens,
  });
}
