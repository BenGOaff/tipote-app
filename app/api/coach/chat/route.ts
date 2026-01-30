// app/api/coach/chat/route.ts
// Coach IA premium (Pro/Elite) : chat court + contextuel + prêt pour suggestions/actions.
// Fix principal : endpoint manquant => 404 côté front.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { buildCoachSystemPrompt } from "@/lib/prompts/coach/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

type StoredPlan = "free" | "basic" | "pro" | "elite";

function normalizePlan(plan: string | null | undefined): StoredPlan {
  const s = String(plan ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("pro")) return "pro";
  if (s.includes("essential")) return "pro";
  if (s.includes("basic")) return "basic";
  return "free";
}

function safeLocale(v: unknown): "fr" | "en" {
  const s = String(v ?? "").toLowerCase();
  return s.startsWith("en") ? "en" : "fr";
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 1200,
      temperature: typeof args.temperature === "number" ? args.temperature : 0.6,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "";
}

function buildContextBlock(args: {
  businessProfile: any | null;
  planJson: any | null;
  pyramids: any[];
  tasks: any[];
  contents: any[];
}) {
  return JSON.stringify(
    {
      business_profile: args.businessProfile ?? null,
      plan: args.planJson ?? null,
      offer_pyramids_recent: args.pyramids ?? [],
      tasks_recent: args.tasks ?? [],
      contents_recent: args.contents ?? [],
    },
    null,
    2,
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    // Profile (plan/locale)
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, plan, locale, first_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const plan = normalizePlan((profileRow as any)?.plan);
    const locale = safeLocale((profileRow as any)?.locale);

    // ✅ gating Pro/Elite
    if (plan !== "pro" && plan !== "elite") {
      return NextResponse.json(
        {
          ok: false,
          code: "COACH_LOCKED",
          error: "Coach premium réservé aux plans Pro/Elite.",
        },
        { status: 403 },
      );
    }

    // Context Tipote (best-effort)
    const [businessProfileRes, businessPlanRes, pyramidsRes, tasksRes, contentsRes] = await Promise.all([
      supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("business_plan").select("plan_json").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("offer_pyramids")
        .select("id, level, pyramid_json, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase
        .from("project_tasks")
        .select("id, title, status, due_date, timeframe, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("content_item")
        .select("id, type, title, status, scheduled_date, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const context = buildContextBlock({
      businessProfile: businessProfileRes.data ?? null,
      planJson: (businessPlanRes.data as any)?.plan_json ?? null,
      pyramids: pyramidsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      contents: contentsRes.data ?? [],
    });

    const system = buildCoachSystemPrompt({ locale });

    const history = parsed.data.history ?? [];
    const userMessage = parsed.data.message;

    const userPrompt = [
      "USER CONTEXT (source of truth from Tipote DB):",
      context,
      "",
      "CONVERSATION (recent):",
      JSON.stringify(history, null, 2),
      "",
      "USER MESSAGE:",
      userMessage,
    ].join("\n");

    // IA owner : OpenAI si configuré, sinon Claude owner (même logique que le reste du projet)
    let raw = "";

    if (openai) {
      const model = process.env.TIPOTE_COACH_MODEL?.trim() || "gpt-4.1";
      const ai = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 1200,
      });
      raw = ai.choices?.[0]?.message?.content ?? "";
    } else {
      const claudeKey =
        process.env.CLAUDE_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY?.trim() ||
        "";

      if (!claudeKey) {
        return NextResponse.json(
          { ok: false, error: "Missing AI configuration (owner keys)." },
          { status: 500 },
        );
      }

      raw = await callClaude({
        apiKey: claudeKey,
        system,
        user: userPrompt,
        maxTokens: 1200,
        temperature: 0.6,
      });
    }

    // Parse output (robuste)
    let out: any = null;
    try {
      out = JSON.parse(raw || "{}");
    } catch {
      out = { message: String(raw || "").trim() };
    }

    const message = String(out?.message ?? "").trim() || "Ok. Donne-moi 1 précision et on avance.";
    const suggestions = Array.isArray(out?.suggestions) ? out.suggestions : [];

    return NextResponse.json({ ok: true, message, suggestions }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
