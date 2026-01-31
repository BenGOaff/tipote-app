// app/api/coach/chat/route.ts
// Coach IA premium (Pro/Elite) : chat court + contextuel + prêt pour suggestions/actions.
// Ajout PREMIUM : mémoire longue durée "facts/tags + last session" depuis public.coach_messages
// (ne dépend plus uniquement du history envoyé par le front)

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

type CoachMemory = {
  summary_tags: string[];
  facts: Record<string, unknown>;
};

function pushTag(tags: Set<string>, tag: string) {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return;
  tags.add(t.slice(0, 64));
}

function extractGoalEuros(text: string): string | null {
  // Ex: "10k", "10k€/mois", "10 000", "10000€"
  const s = text.toLowerCase();
  const m1 = s.match(/\b(\d{1,3})\s?k\b/); // 10k
  if (m1?.[1]) return `${m1[1]}k`;
  const m2 = s.match(/\b(\d{2,3})\s?\.?\s?0{3}\b/); // 10000
  if (m2?.[0]) return m2[0].replace(/\s|\./g, "");
  const m3 = s.match(/\b(\d{1,6})\s?€\b/);
  if (m3?.[1]) return m3[1];
  return null;
}

function deriveMemory(args: {
  userMessage: string;
  assistantMessage: string;
  history?: { role: string; content: string }[];
}): CoachMemory {
  const tags = new Set<string>();
  const facts: Record<string, unknown> = {};

  const merged = [args.userMessage, args.assistantMessage, ...(args.history ?? []).map((h) => h.content)].join(
    "\n",
  );
  const low = merged.toLowerCase();

  // Tags (simples mais utiles)
  if (low.includes("linkedin")) pushTag(tags, "channel_linkedin");
  if (low.includes("instagram")) pushTag(tags, "channel_instagram");
  if (low.includes("tiktok")) pushTag(tags, "channel_tiktok");
  if (low.includes("youtube")) pushTag(tags, "channel_youtube");
  if (low.includes("newsletter") || low.includes("email") || low.includes("e-mail")) pushTag(tags, "channel_email");

  if (low.includes("offre") || low.includes("pricing") || low.includes("prix") || low.includes("tarif"))
    pushTag(tags, "topic_offer");
  if (low.includes("acquisition") || low.includes("prospect") || low.includes("lead"))
    pushTag(tags, "topic_acquisition");
  if (low.includes("vente") || low.includes("clos") || low.includes("closing")) pushTag(tags, "topic_sales");

  // Preferences / aversions
  if (low.includes("cold call") || low.includes("appel à froid") || low.includes("appels à froid")) {
    facts.aversion = Array.isArray(facts.aversion) ? facts.aversion : [];
    (facts.aversion as any[]).push("cold_call");
    pushTag(tags, "aversion_cold_call");
  }

  const goal = extractGoalEuros(merged);
  if (goal) {
    facts.objectif = goal;
    pushTag(tags, "has_goal");
  }

  // Mini "last decision" heuristique
  const decisionMatch = merged.match(/\b(tester|test|expérimenter|experimenter)\b[\s\S]{0,120}/i);
  if (decisionMatch?.[0]) {
    facts.decision_en_cours = decisionMatch[0].trim().slice(0, 160);
    pushTag(tags, "has_decision");
  }

  return { summary_tags: Array.from(tags), facts };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type CoachMessageRow = {
  role: "user" | "assistant";
  content: string;
  summary_tags: string[] | null;
  facts: Record<string, unknown> | null;
  created_at: string;
};

function buildMemoryBlock(rows: CoachMessageRow[]) {
  // rows: DESC (most recent first)
  const tags = new Set<string>();
  const facts: Record<string, unknown> = {};
  let lastAssistant: CoachMessageRow | null = null;
  let lastDecision: string | null = null;
  let lastGoal: string | null = null;

  for (const r of rows) {
    if (!lastAssistant && r.role === "assistant") lastAssistant = r;

    if (Array.isArray(r.summary_tags)) {
      for (const t of r.summary_tags) {
        const s = String(t || "").trim().toLowerCase();
        if (s) tags.add(s.slice(0, 64));
      }
    }

    if (isRecord(r.facts)) {
      // Merge shallow, latest wins
      for (const [k, v] of Object.entries(r.facts)) {
        if (facts[k] === undefined) facts[k] = v;
      }

      if (!lastDecision && typeof r.facts.decision_en_cours === "string") {
        lastDecision = String(r.facts.decision_en_cours).trim() || null;
      }
      if (!lastGoal && (typeof r.facts.objectif === "string" || typeof r.facts.goal === "string")) {
        lastGoal = String((r.facts.objectif ?? r.facts.goal) as any).trim() || null;
      }
    }
  }

  const lines: string[] = [];

  const tagsArr = Array.from(tags).slice(0, 25);
  if (tagsArr.length) lines.push(`- Tags: ${tagsArr.join(", ")}`);

  if (lastGoal) lines.push(`- Objectif: ${lastGoal}`);
  if (lastDecision) lines.push(`- Dernière décision: ${lastDecision}`);

  const aversion = (facts as any)?.aversion;
  if (Array.isArray(aversion) && aversion.length) {
    lines.push(`- Aversions: ${aversion.slice(0, 5).join(", ")}`);
  }

  const coreFactsKeys = Object.keys(facts).filter((k) => !["aversion"].includes(k));
  if (coreFactsKeys.length) {
    // On évite un dump: juste les clés/valeurs importantes
    const picked: string[] = [];
    for (const k of coreFactsKeys.slice(0, 10)) {
      const v = (facts as any)[k];
      const vs =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : Array.isArray(v)
              ? v.slice(0, 5).map((x) => String(x)).join(", ")
              : "";
      if (vs) picked.push(`${k}: ${vs}`.slice(0, 160));
    }
    if (picked.length) lines.push(`- Facts: ${picked.join(" | ")}`);
  }

  if (lastAssistant?.content) {
    const d = lastAssistant.created_at ? new Date(lastAssistant.created_at).toISOString().slice(0, 10) : "";
    lines.push("");
    lines.push(`Dernier message coach (${d}):`);
    lines.push(lastAssistant.content.slice(0, 900));
  }

  return lines.join("\n").trim();
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

    // Mémoire longue durée (best-effort): derniers messages + facts/tags
    const memoryRes = await supabase
      .from("coach_messages")
      .select("role, content, summary_tags, facts, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const memoryRows = (memoryRes.data ?? []) as CoachMessageRow[];
    const memoryBlock = memoryRows.length ? buildMemoryBlock(memoryRows) : "";

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
      "LONG-TERM MEMORY (facts/tags + last session):",
      memoryBlock || "(none yet)",
      "",
      "USER CONTEXT (source of truth from Tipote DB):",
      context,
      "",
      "CONVERSATION (recent):",
      JSON.stringify(history, null, 2),
      "",
      "USER MESSAGE:",
      userMessage,
    ].join("\n");

    // IA owner : OpenAI si configuré, sinon Claude owner
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
        return NextResponse.json({ ok: false, error: "Missing AI configuration (owner keys)." }, { status: 500 });
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

    const memory = deriveMemory({ userMessage, assistantMessage: message, history });

    return NextResponse.json({ ok: true, message, suggestions, memory }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
