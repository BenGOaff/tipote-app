// app/api/quiz/[quizId]/rewrite/route.ts
// AI reformulation for any text field of a quiz, in the quiz's own tone.
//
// Marie's feedback (#4, 2026-04): "écrire mon idée et cliquer sur les
// petites étoiles pour qu'il reformule dans le ton du quiz". Each text
// field in the editor (question, option, result title/description) gets
// a tiny ✨ button. Click → 3 proposals appear inline → click one to
// apply. The model only sees the field's plain text + the surrounding
// quiz context (title + intro + address_form), so the reformulation
// stays consistent with Marie's voice.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit } from "@/lib/aiRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// Per-user soft cap on rewrite calls. 60 / 5min covers heavy editing
// (clicking ✨ on every field of a long quiz once or twice) without
// letting a runaway client burn Anthropic credits.
const REWRITE_RATE_LIMIT = { limit: 60, windowMs: 5 * 60 * 1000 };

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    ""
  );
}

function getModel(): string {
  // Haiku — fast + cheap. Reformulating a single short string is well within
  // its sweet spot, and Marie will click ✨ many times so latency matters.
  return process.env.ANTHROPIC_REWRITE_MODEL?.trim() || "claude-haiku-4-5-20251001";
}

const ALLOWED_KINDS = new Set([
  "question", "option", "result_title", "result_description",
  "result_insight", "result_projection", "intro", "title", "generic",
]);

const MAX_TEXT_CHARS = 1000;
const MAX_INSTRUCTION_CHARS = 200;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> },
) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "AI rewrite unavailable: missing Claude API key." },
      { status: 503 },
    );
  }

  const { quizId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Per-user soft cap before we burn an Anthropic call. The Map is in-
  // memory per Vercel instance — good enough for accidental loops; real
  // abuse is also caught by Anthropic's account-level quota.
  const rl = checkRateLimit({
    key: `rewrite:${user.id}`,
    limit: REWRITE_RATE_LIMIT.limit,
    windowMs: REWRITE_RATE_LIMIT.windowMs,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: `Trop de demandes — réessaie dans ${rl.retryAfterSec}s.`, retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { text?: string; fieldKind?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Empty text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ ok: false, error: `Text too long (max ${MAX_TEXT_CHARS} chars)` }, { status: 400 });
  }
  const fieldKind = ALLOWED_KINDS.has(String(body.fieldKind)) ? String(body.fieldKind) : "generic";
  const instruction = String(body.instruction ?? "").trim().slice(0, MAX_INSTRUCTION_CHARS);

  // Verify ownership + pull tone signals.
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("user_id, title, introduction, locale, address_form, mode")
    .eq("id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
  }

  const stripHtml = (s: string | null | undefined) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
  const quizTitle = stripHtml((quiz as any).title) || "Quiz";
  const quizIntro = stripHtml((quiz as any).introduction).slice(0, 600);
  const localeTag = String((quiz as any).locale ?? "fr");
  const addressForm: "tu" | "vous" = (quiz as any).address_form === "vous" ? "vous" : "tu";
  const isFr = localeTag.toLowerCase().startsWith("fr");
  const isSurvey = (quiz as any).mode === "survey";

  // Each field kind gets a tone hint — questions are direct, result titles
  // are warm + short, descriptions are explanatory but not preachy.
  const kindHintsFr: Record<string, string> = {
    question: "Question directe et engageante (1 phrase courte).",
    option: "Option de réponse courte (3-8 mots), naturelle.",
    result_title: "Titre de profil de résultat, court (3-6 mots), évocateur.",
    result_description: "Description du résultat : 1-3 phrases empathiques qui parlent à la personne.",
    result_insight: "Insight clé sur ce profil : 1-2 phrases qui résonnent.",
    result_projection: "Projection encourageante : 1-2 phrases positives sur le futur.",
    intro: "Introduction du quiz : 1-2 phrases qui donnent envie de commencer.",
    title: "Titre du quiz : court et accrocheur.",
    generic: "Texte cohérent avec le ton du quiz.",
  };
  const kindHintsEn: Record<string, string> = {
    question: "Direct, engaging question (one short sentence).",
    option: "Short answer option (3-8 words), natural.",
    result_title: "Result profile title, short (3-6 words), evocative.",
    result_description: "Result description: 1-3 empathetic sentences speaking to the person.",
    result_insight: "Key insight on this profile: 1-2 resonant sentences.",
    result_projection: "Encouraging projection: 1-2 positive sentences about the future.",
    intro: "Quiz introduction: 1-2 sentences that make people want to start.",
    title: "Quiz title: short and catchy.",
    generic: "Text consistent with the quiz tone.",
  };
  const kindHint = (isFr ? kindHintsFr : kindHintsEn)[fieldKind] ?? kindHintsFr.generic;

  const systemPrompt = isFr
    ? `Tu es l'autrice du quiz « ${quizTitle} »${quizIntro ? `, dont l'intro est : « ${quizIntro} »` : ""}. Tu réécris un de ses champs en gardant SON ton (${addressForm === "vous" ? "vouvoiement" : "tutoiement"}, ${isSurvey ? "ton sondage neutre" : "ton chaleureux et personnel"}). ${kindHint} Tu ne changes pas la signification, tu reformules. Réponds STRICTEMENT en JSON valide sans texte autour, dans ce format : {"proposals":["v1","v2","v3"]}. Trois variantes différentes (longueur ou angle), pas de duplicat.`
    : `You are the author of the quiz "${quizTitle}"${quizIntro ? `, whose intro reads: "${quizIntro}"` : ""}. You're rewriting one of its fields while keeping THE author's tone (${addressForm === "vous" ? "formal/polite address" : "informal address"}, ${isSurvey ? "neutral survey tone" : "warm, personal tone"}). ${kindHint} Don't change the meaning, just reformulate. Respond STRICTLY with valid JSON, no surrounding text, in this exact shape: {"proposals":["v1","v2","v3"]}. Three different variants (length or angle), no duplicates.`;

  const userPrompt = isFr
    ? `Texte à reformuler :\n"""${text}"""\n${instruction ? `\nDirection de l'autrice : ${instruction}\n` : ""}\nRends 3 reformulations distinctes au format JSON demandé.`
    : `Text to rewrite:\n"""${text}"""\n${instruction ? `\nAuthor's direction: ${instruction}\n` : ""}\nReturn 3 distinct rewrites in the JSON format above.`;

  let raw = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 600,
        // A hair higher than rebalance — we want some variety across the 3
        // proposals without going into hallucination territory.
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[rewrite] Claude API error:", res.status, errText.slice(0, 500));
      return NextResponse.json(
        { ok: false, error: `AI rewrite failed (${res.status}). Try again.` },
        { status: 502 },
      );
    }
    const json = await res.json();
    raw = String((Array.isArray(json?.content) && json.content[0]?.text) || "").trim();
  } catch (e: any) {
    console.error("[rewrite] Fetch failure:", e);
    return NextResponse.json(
      { ok: false, error: e?.name === "AbortError" ? "AI rewrite timed out." : "AI rewrite failed." },
      { status: 502 },
    );
  }

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: { proposals?: unknown };
  try {
    parsed = JSON.parse(stripped);
  } catch {
    console.error("[rewrite] JSON parse failed:", stripped.slice(0, 300));
    return NextResponse.json(
      { ok: false, error: "AI returned an unreadable response. Please try again." },
      { status: 502 },
    );
  }

  const proposals = Array.isArray(parsed.proposals)
    ? parsed.proposals
        .map((p) => String(p ?? "").trim())
        .filter((p) => p.length > 0 && p.length <= MAX_TEXT_CHARS * 1.5)
        .slice(0, 5)
    : [];

  if (proposals.length === 0) {
    return NextResponse.json(
      { ok: false, error: "AI didn't return any proposal." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, proposals });
}
