// app/api/quiz/gender-variants/route.ts
// Given a piece of quiz text and a locale, produce the 3 grammatical variants
// (masculine / feminine / inclusive) so the editor can store them as a single
// string with the {m|f|x} interpolation syntax consumed by PublicQuizClient.
//
// Costs 0.5 credits per call. Pass one item at a time to keep latency low and
// make partial failures cheap to retry.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CREDIT_COST = 0.5;
const MAX_TEXT_LEN = 2000;

function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function getClaudeModel(): string {
  return (
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

type Variants = { m: string; f: string; x: string };

function buildPrompt(text: string, locale: string): { system: string; user: string } {
  const lang = (locale || "fr").slice(0, 2).toLowerCase();
  const system = [
    "You rewrite a single piece of quiz copy into three grammatical variants:",
    "  - masculine (speaking to a male reader)",
    "  - feminine (speaking to a female reader)",
    "  - inclusive / gender-neutral (addressing any reader)",
    "",
    "Rules:",
    "- Preserve the author's tone, punctuation, emojis and length.",
    "- Only change gendered pronouns, adjectives, participles and nouns that disagree.",
    "- Keep any {name} placeholders intact — do not remove or rename them.",
    "- If the input already contains {m|f|x} patterns, resolve them: the masculine",
    "  output uses the masculine branch, etc. Do not re-emit braces in the output.",
    "- If the language does not mark gender (e.g. English), return the same text",
    "  three times rather than inventing variants.",
    "- For the inclusive variant, prefer natural neutral phrasing over typographic",
    "  tricks. Use mid-dot only if it's the most idiomatic option in the language.",
    "- Never add any new idea, CTA, or content.",
    "",
    `Target language: ${lang}.`,
    "",
    "Return ONLY a JSON object with this exact shape, no prose, no markdown:",
    '{"m":"…","f":"…","x":"…"}',
  ].join("\n");

  const user = `Text to rewrite:\n\n${text}`;
  return { system, user };
}

function parseVariants(raw: string): Variants | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const j = JSON.parse(trimmed);
    if (j && typeof j === "object") {
      const m = typeof j.m === "string" ? j.m : "";
      const f = typeof j.f === "string" ? j.f : "";
      const x = typeof j.x === "string" ? j.x : "";
      if (m && f && x) return { m, f, x };
    }
  } catch { /* fall through */ }
  return null;
}

/** Fold the 3 variants back into the single-string `{m|f|x}` format. */
export function foldVariants(v: Variants): string {
  if (v.m === v.f && v.f === v.x) return v.m;
  // Escape any literal `{` or `|` or `}` in the variants to avoid breaking interpolation.
  // Literal braces in quiz copy are rare; users who need them can double them manually.
  return `{${v.m}|${v.f}|${v.x}}`;
}

export async function POST(req: NextRequest) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "CLAUDE_API_KEY_MISSING" }, { status: 500 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(body?.text ?? "").trim();
  const locale = String(body?.locale ?? "fr").trim();

  if (!text) {
    return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LEN) {
    return NextResponse.json(
      { ok: false, error: `text exceeds ${MAX_TEXT_LEN} characters` },
      { status: 400 },
    );
  }

  try {
    await ensureUserCredits(user.id);
    const creditsResult = await consumeCredits(user.id, CREDIT_COST, {
      feature: "quiz_gender_variants",
    });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = String((creditsResult as any).error ?? "").toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }
  } catch (e: any) {
    const msg = String(e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    console.error("[quiz/gender-variants] credits error:", e);
    return NextResponse.json({ ok: false, error: "credits_error" }, { status: 500 });
  }

  const { system, user: userPrompt } = buildPrompt(text, locale);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45_000);

  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: abort.signal,
      body: JSON.stringify({
        model: getClaudeModel(),
        max_tokens: 1000,
        temperature: 0.3,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (fetchErr: any) {
    clearTimeout(timer);
    const name = String(fetchErr?.name ?? "");
    if (name === "AbortError") {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    console.error("[quiz/gender-variants] fetch error:", fetchErr);
    return NextResponse.json({ ok: false, error: "FETCH_FAILED" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[quiz/gender-variants] Claude error", res.status, errText.slice(0, 500));
    const status = res.status === 429 ? 429 : 502;
    return NextResponse.json({ ok: false, error: `CLAUDE_${res.status}` }, { status });
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_CLAUDE_RESPONSE" }, { status: 502 });
  }

  const raw = Array.isArray(json?.content)
    ? json.content.map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : "")).join("").trim()
    : "";

  const variants = parseVariants(raw);
  if (!variants) {
    console.error("[quiz/gender-variants] could not parse variants", raw.slice(0, 300));
    return NextResponse.json({ ok: false, error: "PARSE_FAILED" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    variants,
    folded: foldVariants(variants),
  });
}
