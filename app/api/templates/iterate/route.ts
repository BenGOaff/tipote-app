// app/api/templates/iterate/route.ts
// Iteration endpoint: takes instruction + current contentData/brandTokens and returns safe patches + next state.
// Auth: requires Supabase session (server) to prevent abuse.
// IMPORTANT: never edits HTML. Only updates structured data.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------- Claude AI ----------

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return process.env.CLAUDE_API_KEY_OWNER?.trim() || process.env.ANTHROPIC_API_KEY_OWNER?.trim() || "";
}

function resolveClaudeModel(): string {
  const raw =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "";
  const v = (raw || "").trim();
  const DEFAULT = "claude-sonnet-4-5-20250929";
  if (!v) return DEFAULT;
  const s = v.toLowerCase();
  if (s === "sonnet" || s === "sonnet-4.5" || s === "sonnet_4_5" || s === "claude-sonnet-4.5") return DEFAULT;
  return v;
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model = resolveClaudeModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 4000,
        temperature: args.temperature ?? 0.2,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Claude API timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API erreur (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  return parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

type Kind = "capture" | "vente" | "vitrine";

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
  kind: z.enum(["capture", "vente", "vitrine"]),
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
    // Hero & headline
    "hero_pretitle",
    "hero_badge",
    "hero_kicker",
    "hero_eyebrow",
    "hero_title",
    "hero_subtitle",
    "hero_description",
    "hook",
    "headline",
    "main_headline",
    "header_bar_text",
    // Visual
    "hero_visual_type",
    "hero_visual_title",
    "hero_visual_subtitle",
    "hero_visual_items",
    "hero_visual_metrics",
    // Content
    "bullets",
    "features",
    "steps",
    "benefits_title",
    "benefits",
    "problem_bullets",
    "program_title",
    "program_items",
    // Social proof
    "social_proof_text",
    "testimonials_title",
    "testimonials",
    // About
    "about_title",
    "about_label",
    "about_name",
    "about_story",
    "about_description",
    // CTA
    "cta_text",
    "cta_subtitle",
    "reassurance_text",
    "final_title",
    "final_description",
    // Brand & layout
    "logo_text",
    "logo_subtitle",
    "footer_text",
    // Extended / legacy
    "top_notice_text",
    "top_notice_link_text",
    "side_badge",
    "key_number",
    "promises",
    "hero_date",
    "target_profiles",
    "schedule_days",
    "floating_labels",
    "daily_program",
    "before_points",
    "after_points",
    "bonuses",
    "counter_label",
    "trainer_name",
    "capture_heading",
    "capture_subtitle",
    // Thank-you page
    "thank_you_title",
    "thank_you_message",
    "thank_you_cta_text",
  ],
  vente: [
    // Hero
    "hero_eyebrow",
    "hero_title",
    "hero_subtitle",
    "hero_bullets",
    "hero_description",
    "alert_banner_text",
    // Problem / Solution
    "problem_title",
    "problem_description",
    "problem_bullets",
    "solution_title",
    "solution_description",
    "solution_bullets",
    // Benefits
    "benefits_title",
    "benefits",
    "benefits_grid",
    // Program
    "program_title",
    "program_items",
    "program_days",
    // About
    "about_title",
    "about_name",
    "about_story",
    "about_description",
    // Testimonials
    "testimonials_title",
    "testimonials",
    "visual_testimonials",
    // Bonuses
    "bonuses_title",
    "bonuses",
    // Guarantee
    "guarantee_title",
    "guarantee_text",
    // Pricing
    "price_title",
    "price_amount",
    "price_old",
    "price_note",
    "pricing_tiers",
    "pricing_plans",
    // Urgency
    "urgency_text",
    // FAQ
    "faq_title",
    "faq_items",
    "faqs",
    // CTA
    "cta_main",
    "cta_text",
    "cta_subtitle",
    "final_title",
    "final_description",
    // Brand & layout
    "logo_text",
    "nav_links",
    "footer_text",
    "footer_links",
    // Extended / legacy
    "stats",
    "speakers",
    "info_cards",
    "offer_hook",
    "offer_title",
    "offer_price",
    "offer_price_old",
    "video_url",
    "video_cta_banner",
    "methods",
    "comparison_rows",
    "qualification_list",
    "pain_points_checklist",
    "limiting_beliefs",
    "disclaimer_text",
    "proof_intro_text",
    "proof_evidence_text",
    "proof_transformation_text",
  ],
  vitrine: [
    // Brand & nav
    "logo_text",
    "logo_image_url",
    "nav_links",
    // Hero
    "hero_eyebrow",
    "hero_title",
    "hero_subtitle",
    "hero_description",
    "cta_text",
    "cta_url",
    "secondary_cta_text",
    "secondary_cta_url",
    // Services
    "services_title",
    "services_subtitle",
    "services",
    // Key numbers
    "numbers_title",
    "key_numbers",
    // Benefits
    "benefits_title",
    "benefits",
    // Program / Process
    "program_title",
    "program_items",
    // About
    "about_title",
    "about_label",
    "about_name",
    "about_story",
    "about_description",
    // Testimonials
    "testimonials_title",
    "testimonials",
    // Pricing
    "price_title",
    "price_amount",
    "price_note",
    "pricing_title",
    "pricing_plans",
    // FAQ
    "faq_title",
    "faq_items",
    "faqs",
    // Contact
    "contact_title",
    "contact_description",
    "contact_cta_text",
    "contact_cta_url",
    "contact_email",
    "contact_phone",
    "contact_address",
    // Footer
    "footer_text",
  ],
};

const BRANDTOKENS_WHITELIST = ["primary", "accent", "headingFont", "bodyFont", "heroBg", "sectionBg"];

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

  const claudeApiKey = getClaudeApiKey();
  if (!claudeApiKey) {
    return NextResponse.json(
      { error: "Clé Claude non configurée (CLAUDE_API_KEY_OWNER manquant)." },
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
    "Tu es un assistant d’édition de pages web (capture, vente, vitrine).",
    "Tu ne modifies jamais le HTML.",
    "Tu produis UNIQUEMENT un objet JSON (pas de markdown, pas de ```json, pas de texte autour).",
    "",
    "Format de sortie EXACT :",
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
    "- Ta réponse COMMENCE par { et FINIT par }. Rien d’autre.",
    "- Pas de triple backticks, pas de commentaire, pas de texte explicatif autour du JSON.",
    "- Les valeurs texte (value) DOIVENT être en français.",
    "- Adapte ton copywriting au ton de la page existante.",
    `- kind = ${kind}`,
    `- templateId = ${templateId}`,
    `- variantId = ${variantId || ""}`,
    "",
    "WHITELIST paths autorisés :",
    `- contentData roots: ${CONTENT_WHITELIST[kind].join(", ")}`,
    `- brandTokens: ${BRANDTOKENS_WHITELIST.join(", ")}`,
    "",
    "Pour changer les couleurs :",
    `- Couleur principale (brand) : { "op": "set", "path": "brandTokens.primary", "value": "#hexcolor" }`,
    `- Couleur d’accent : { "op": "set", "path": "brandTokens.accent", "value": "#hexcolor" }`,
    `- Fond hero : { "op": "set", "path": "brandTokens.heroBg", "value": "#hexcolor" }`,
    `- Fond sections : { "op": "set", "path": "brandTokens.sectionBg", "value": "#hexcolor" }`,
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
    raw = await callClaude({
      apiKey: claudeApiKey,
      system,
      user,
      maxTokens: 4000,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erreur IA" },
      { status: 500 }
    );
  }

  // Robust JSON extraction: Claude sometimes wraps JSON in markdown fences
  // or adds explanatory text before/after the JSON object.
  function extractJSON(text: string): string {
    // 1. Try raw text first
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return trimmed;
    // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenced?.[1]?.trim()) return fenced[1].trim();
    // 3. Find first { ... last } in the text
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
  }

  let out: z.infer<typeof OutputSchema>;
  try {
    const jsonStr = extractJSON(raw);
    out = OutputSchema.parse(JSON.parse(jsonStr));
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
