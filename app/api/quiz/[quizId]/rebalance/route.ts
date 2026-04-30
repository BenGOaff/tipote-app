// app/api/quiz/[quizId]/rebalance/route.ts
// AI-driven option-mapping rebalance for a quiz.
//
// Marie's feedback (#3 partie A, 2026-04): "I added 2 questions to point to
// my 4th result, but with 10 questions and 4 results, my new result will
// never win the majority vote." This endpoint asks Claude to redistribute
// the option→result mapping across the EXISTING questions so the target
// result gets enough coverage, picking the options that fit it semantically
// rather than blindly reassigning.
//
// We DO NOT touch question text, option text, or result content here —
// only the `result_index` field on each option. That keeps the change
// reviewable in a small diff and keeps the creator's voice intact.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit } from "@/lib/aiRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// Tighter cap than /rewrite: rebalance is a Sonnet call (~10× the cost
// of a Haiku rewrite) and there's no legitimate use case for hammering
// it. 10 / 5min lets a creator iterate on the proposed diff a few times.
const REBALANCE_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    ""
  );
}

function getModel(): string {
  // Sonnet for the rebalance decision: a one-shot semantic-fit choice across
  // the whole quiz benefits from the better model. Cost is bounded — N
  // questions × M options is a few hundred tokens of input + a small JSON
  // out, even for a long quiz.
  return process.env.ANTHROPIC_REBALANCE_MODEL?.trim() || "claude-sonnet-4-20250514";
}

type RebalanceChange = {
  question_index: number;
  option_index: number;
  from: number;
  to: number;
};

type RebalanceResponse = {
  changes: RebalanceChange[];
  rationale?: string;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> },
) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "AI rebalance unavailable: server is missing the Claude API key." },
      { status: 503 },
    );
  }

  const { quizId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Soft cap before we ask Sonnet — rebalance is the most expensive AI
  // route in the codebase. Per-Vercel-instance limit; Anthropic's quota
  // catches anything that gets through across instances.
  const rl = checkRateLimit({
    key: `rebalance:${user.id}`,
    limit: REBALANCE_RATE_LIMIT.limit,
    windowMs: REBALANCE_RATE_LIMIT.windowMs,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: `Trop de demandes de rééquilibrage — réessaie dans ${rl.retryAfterSec}s.`, retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { targetResultIndex?: number; intent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const targetResultIndex = Number(body.targetResultIndex);
  if (!Number.isInteger(targetResultIndex) || targetResultIndex < 0) {
    return NextResponse.json(
      { ok: false, error: "targetResultIndex (integer ≥ 0) is required" },
      { status: 400 },
    );
  }
  const intent = String(body.intent ?? "").trim().slice(0, 500);

  // Verify ownership and pull the live data via service role so we work on
  // the canonical row even if RLS is mid-update.
  const { data: quiz, error: quizErr } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, locale, address_form")
    .eq("id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (quizErr || !quiz) {
    return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
  }

  const [{ data: questions }, { data: results }] = await Promise.all([
    supabaseAdmin
      .from("quiz_questions")
      .select("question_text, options, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order"),
    supabaseAdmin
      .from("quiz_results")
      .select("title, description, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order"),
  ]);

  if (!questions || questions.length === 0) {
    return NextResponse.json({ ok: false, error: "Quiz has no questions to rebalance" }, { status: 400 });
  }
  if (!results || results.length < 2) {
    return NextResponse.json({ ok: false, error: "Need at least 2 results to rebalance" }, { status: 400 });
  }
  if (targetResultIndex >= results.length) {
    return NextResponse.json({ ok: false, error: "targetResultIndex out of range" }, { status: 400 });
  }

  const N = questions.length;
  const R = results.length;
  const expected = Math.max(1, Math.ceil(N / R));

  // Build a compact JSON snapshot for the model. We strip rich-text HTML so
  // Claude doesn't get distracted by markup it can't act on.
  const stripHtml = (s: string | null | undefined) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
  const questionsJson = (questions ?? []).map((q: any, qi: number) => ({
    index: qi,
    text: stripHtml(q.question_text),
    options: (Array.isArray(q.options) ? q.options : []).map((o: any, oi: number) => ({
      index: oi,
      text: stripHtml(o?.text),
      result_index: Number(o?.result_index ?? 0),
    })),
  }));
  const resultsJson = (results ?? []).map((r: any, ri: number) => ({
    index: ri,
    title: stripHtml(r.title),
    description: stripHtml(r.description),
  }));

  const localeTag = String((quiz as any).locale ?? "fr");
  const isFr = localeTag.toLowerCase().startsWith("fr");

  const targetTitle = resultsJson[targetResultIndex]?.title || `Résultat ${targetResultIndex + 1}`;

  const systemPrompt = isFr
    ? `Tu es un expert en design de quiz de personnalité. Ton rôle : redistribuer les "result_index" des options d'un quiz EXISTANT pour qu'un résultat sous-représenté devienne atteignable, SANS modifier le texte des questions, des options ou des résultats. Tu dois choisir, parmi les options actuelles, celles qui correspondent SÉMANTIQUEMENT le mieux au résultat cible et leur réassigner result_index. Garde aussi un équilibre raisonnable pour les autres résultats — chaque résultat doit avoir au moins ${expected} questions qui mènent à lui (au moins une option avec son result_index).`
    : `You are a personality-quiz design expert. Your job: redistribute the "result_index" of options on an EXISTING quiz so an under-represented result becomes reachable, WITHOUT touching any question, option, or result text. Pick the options that semantically fit the target result best and reassign their result_index. Keep a reasonable balance across all results — every result should have at least ${expected} questions leading to it (at least one option carrying its result_index).`;

  const userPrompt = isFr
    ? `Quiz actuel (${N} questions, ${R} résultats) :

QUESTIONS :
${JSON.stringify(questionsJson, null, 2)}

RÉSULTATS :
${JSON.stringify(resultsJson, null, 2)}

OBJECTIF : faire en sorte que le résultat à l'index ${targetResultIndex} ("${targetTitle}") soit atteignable. Il doit recevoir au moins ${expected} options pointant vers lui (idéalement une option par question minimum sur ${expected} questions différentes).

${intent ? `INTENTION DE L'AUTRICE : "${intent}"\n` : ""}RÈGLES STRICTES :
- NE TOUCHE PAS au texte des questions, des options, ni des résultats.
- NE renvoie QUE les CHANGEMENTS (option dont le result_index doit changer).
- Pour chaque changement, indique : question_index, option_index, from (l'ancien result_index), to (le nouveau).
- Choisis les options qui correspondent sémantiquement au résultat cible (et aux autres si tu en réassignes).
- Garde tous les résultats atteignables — pas seulement le résultat cible.

Réponds STRICTEMENT en JSON valide, sans texte autour, dans ce format exact :
{
  "changes": [
    { "question_index": 0, "option_index": 1, "from": 0, "to": ${targetResultIndex} }
  ],
  "rationale": "Une phrase courte expliquant la logique générale."
}`
    : `Current quiz (${N} questions, ${R} results):

QUESTIONS:
${JSON.stringify(questionsJson, null, 2)}

RESULTS:
${JSON.stringify(resultsJson, null, 2)}

GOAL: make the result at index ${targetResultIndex} ("${targetTitle}") reachable. It must receive at least ${expected} options pointing to it (ideally at least one option each on ${expected} different questions).

${intent ? `AUTHOR INTENT: "${intent}"\n` : ""}STRICT RULES:
- DO NOT touch the question, option, or result text.
- ONLY return CHANGES (options whose result_index needs to change).
- For each change, return: question_index, option_index, from (the previous result_index), to (the new one).
- Pick options that semantically match the target result (and any others you reassign).
- Keep every result reachable — not just the target.

Respond STRICTLY with valid JSON, no surrounding text, in this exact shape:
{
  "changes": [
    { "question_index": 0, "option_index": 1, "from": 0, "to": ${targetResultIndex} }
  ],
  "rationale": "One short sentence explaining the overall logic."
}`;

  let claudeText = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
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
        max_tokens: 2000,
        temperature: 0.3, // Low temp — we want consistent semantic mapping, not creativity.
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[rebalance] Claude API error:", res.status, errText.slice(0, 500));
      return NextResponse.json(
        { ok: false, error: `AI rebalance failed (${res.status}). Try again in a minute.` },
        { status: 502 },
      );
    }
    const json = await res.json();
    claudeText = String(
      (Array.isArray(json?.content) && json.content[0]?.text) || ""
    ).trim();
  } catch (e: any) {
    console.error("[rebalance] Fetch failure:", e);
    return NextResponse.json(
      { ok: false, error: e?.name === "AbortError" ? "AI rebalance timed out." : "AI rebalance failed." },
      { status: 502 },
    );
  }

  // Parse + validate. Strip any backtick fences Claude might have added
  // despite the "no surrounding text" instruction.
  const stripped = claudeText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: RebalanceResponse;
  try {
    parsed = JSON.parse(stripped) as RebalanceResponse;
  } catch (e) {
    console.error("[rebalance] Could not parse Claude JSON:", stripped.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: "AI returned an unreadable response. Please try again." },
      { status: 502 },
    );
  }

  if (!Array.isArray(parsed.changes)) {
    return NextResponse.json(
      { ok: false, error: "AI response missing `changes` array." },
      { status: 502 },
    );
  }

  // Validate every change references real indices and matches the current
  // `from` value — drop the ones that don't, keep the safe ones. This is
  // defensive: the model is consistent at temp 0.3 but not infallible.
  const safeChanges: RebalanceChange[] = [];
  for (const raw of parsed.changes) {
    const qi = Number((raw as any).question_index);
    const oi = Number((raw as any).option_index);
    const from = Number((raw as any).from);
    const to = Number((raw as any).to);
    if (!Number.isInteger(qi) || qi < 0 || qi >= N) continue;
    const q = questionsJson[qi];
    if (!Number.isInteger(oi) || oi < 0 || oi >= q.options.length) continue;
    if (!Number.isInteger(to) || to < 0 || to >= R) continue;
    if (q.options[oi].result_index !== from) {
      // Stale `from` — re-pin to the actual current value so the UI diff
      // matches reality.
      safeChanges.push({ question_index: qi, option_index: oi, from: q.options[oi].result_index, to });
    } else if (from !== to) {
      safeChanges.push({ question_index: qi, option_index: oi, from, to });
    }
  }

  return NextResponse.json({
    ok: true,
    changes: safeChanges,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : null,
    target_result_index: targetResultIndex,
  });
}
