// app/api/templates/reformulate/route.ts
// Reformulation endpoint: AI rephrases the user's instruction to confirm understanding.
// This is a lightweight pre-step before applying changes.
// Does NOT consume credits.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  const timer = setTimeout(() => controller.abort(), 30_000);

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
        max_tokens: args.maxTokens ?? 200,
        temperature: args.temperature ?? 0.3,
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

const InputSchema = z.object({
  instruction: z.string().min(3),
  kind: z.enum(["capture", "vente"]),
  locale: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claudeApiKey = getClaudeApiKey();
  if (!claudeApiKey) {
    return NextResponse.json({ error: "Clé Claude non configurée." }, { status: 500 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = null; }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { instruction, kind, locale: inputLocale } = parsed.data;

  // Detect language: use provided locale, or try to detect from user's profile
  const userLocale = inputLocale || "fr";
  const LOCALE_LABELS: Record<string, string> = {
    fr: "francais", en: "English", es: "espanol", it: "italiano",
    pt: "portugues", de: "Deutsch", nl: "Nederlands", ar: "arabe", tr: "Turk",
  };
  const langLabel = LOCALE_LABELS[userLocale] ?? "francais";

  const pageTypeLabels: Record<string, Record<string, string>> = {
    fr: { capture: "page de capture", vente: "page de vente" },
    en: { capture: "capture page", vente: "sales page" },
    es: { capture: "pagina de captura", vente: "pagina de venta" },
    it: { capture: "pagina di cattura", vente: "pagina di vendita" },
    de: { capture: "Erfassungsseite", vente: "Verkaufsseite" },
    pt: { capture: "pagina de captura", vente: "pagina de venda" },
  };
  const pageTypeLabel = pageTypeLabels[userLocale]?.[kind] || pageTypeLabels.fr[kind];

  const firstPersonLabels: Record<string, string> = {
    fr: "Je vais", en: "I will", es: "Voy a", it: "Sto per",
    de: "Ich werde", pt: "Eu vou", nl: "Ik ga", ar: "سأقوم", tr: "Yapacagim",
  };
  const firstPerson = firstPersonLabels[userLocale] || "Je vais";

  try {
    const systemPrompt = [
      "You are Tipote, an assistant that helps modify web pages.",
      `The user is working on a ${pageTypeLabel}.`,
      "Your task: rephrase the user's request in a clear and precise sentence to confirm understanding.",
      "Respond ONLY with JSON: { \"reformulation\": \"...\" }",
      `The reformulation MUST be in ${langLabel}, short (1-2 sentences max), first person singular ("${firstPerson}...").`,
      "Examples:",
      `- Input: "change the title" -> { "reformulation": "${firstPerson} modify the main title of your page." }`,
      `- Input: "more urgent" -> { "reformulation": "${firstPerson} make the overall tone more urgent with action words." }`,
    ].join("\n");

    const raw = await callClaude({
      apiKey: claudeApiKey,
      system: systemPrompt,
      user: instruction,
      maxTokens: 200,
      temperature: 0.3,
    });
    let reformulation = instruction;

    try {
      const parsed = JSON.parse(raw);
      if (parsed.reformulation) {
        reformulation = parsed.reformulation;
      }
    } catch {
      // If parsing fails, try to extract from fenced JSON
      const match = raw.match(/\{[\s\S]*?"reformulation"\s*:\s*"([^"]+)"[\s\S]*?\}/);
      if (match?.[1]) {
        reformulation = match[1];
      }
    }

    return NextResponse.json({ reformulation });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
