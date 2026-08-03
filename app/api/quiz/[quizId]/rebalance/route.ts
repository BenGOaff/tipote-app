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
import { resolveAnthropicModel } from "@/lib/anthropicModel";

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
  // out, even for a long quiz. Safety net contre les IDs legacy via lib.
  return resolveAnthropicModel(process.env.ANTHROPIC_REBALANCE_MODEL, "sonnet");
}

type RebalanceChange = {
  question_index: number;
  option_index: number;
  from: number;
  to: number;
};

/**
 * Une REPONSE AJOUTEE a une question qui en manquait.
 *
 * Escalade Veronique, 3 aout 2026 : "comme il n'y a que 3 reponses
 * possibles par question et 4 resultats, forcement ca deconne." Elle a
 * raison, et le reequilibrage ne pouvait rien pour elle : il ne faisait
 * que DEPLACER des result_index d'un profil vers un autre. Quand une
 * question offre moins de reponses qu'il n'y a de profils, deplacer
 * laisse toujours un profil decouvert. Il faut AJOUTER.
 *
 * On n'ajoute jamais de QUESTION : ca changerait la longueur du quiz que
 * la creatrice a choisie. Une reponse manquante, c'est un trou ; une
 * question en plus, c'est une decision qui lui appartient.
 */
type RebalanceAddition = {
  question_index: number;
  text: string;
  result_index: number;
};

type RebalanceResponse = {
  changes: RebalanceChange[];
  additions?: RebalanceAddition[];
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

  let body: { targetResultIndex?: number; intent?: string; questions?: unknown; results?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Instantane de l'EDITEUR (etat courant, potentiellement NON enregistre).
  // Le createur peut avoir ajoute un resultat ou retouche des options sans
  // enregistrer : le rebalance doit raisonner sur ce qu'il VOIT a l'ecran,
  // pas sur la base (sinon "targetResultIndex out of range" des qu'un
  // resultat n'existe que dans l'editeur). Fallback : la base. L'instantane
  // ne sert QU'A construire le prompt, aucune ecriture n'en derive.
  const cap = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const snapshotQuestions = Array.isArray(body.questions)
    ? body.questions.slice(0, 60).map((q) => {
        const qq = (q ?? {}) as Record<string, unknown>;
        return {
          question_text: cap(qq.question_text, 600),
          // Le TYPE decide si un manque de reponses est un defaut :
          // yes_no en a deux par nature, free_text / rating_scale /
          // star_rating n'en ont aucune (retour Jocelyne, 1er aout).
          question_type: cap(qq.question_type, 40) || "multiple_choice",
          options: Array.isArray(qq.options)
            ? qq.options.slice(0, 10).map((o) => {
                const oo = (o ?? {}) as Record<string, unknown>;
                return { text: cap(oo.text, 400), result_index: Number(oo.result_index ?? 0) };
              })
            : [],
        };
      })
    : null;
  const snapshotResults = Array.isArray(body.results)
    ? body.results.slice(0, 12).map((r) => {
        const rr = (r ?? {}) as Record<string, unknown>;
        return { title: cap(rr.title, 400), description: cap(rr.description, 600) };
      })
    : null;

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

  const [{ data: dbQuestions }, { data: dbResults }] = await Promise.all([
    supabaseAdmin
      .from("quiz_questions")
      .select("question_text, question_type, options, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order"),
    supabaseAdmin
      .from("quiz_results")
      .select("title, description, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order"),
  ]);

  // Priorite a l'instantane editeur quand il est exploitable.
  const questions =
    snapshotQuestions && snapshotQuestions.length > 0 ? snapshotQuestions : dbQuestions;
  const results = snapshotResults && snapshotResults.length >= 2 ? snapshotResults : dbResults;

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
    question_type: String(q.question_type ?? "multiple_choice") || "multiple_choice",
    options: (Array.isArray(q.options) ? q.options : []).map((o: any, oi: number) => ({
      index: oi,
      text: stripHtml(o?.text),
      result_index: Number(o?.result_index ?? 0),
    })),
  }));

  // Questions ou le profil cible n'a AUCUNE reponse ET ou il reste de la
  // place pour lui en creer une. On exclut yes_no (deux reponses, c'est
  // le principe du type) et les types sans options.
  const roomForTarget = (q: (typeof questionsJson)[number]) =>
    q.question_type === "multiple_choice" &&
    q.options.length > 0 &&
    q.options.length < R &&
    !q.options.some((o: { result_index: number }) => o.result_index === targetResultIndex);
  const shortQuestions = questionsJson.filter(roomForTarget);
  const resultsJson = (results ?? []).map((r: any, ri: number) => ({
    index: ri,
    title: stripHtml(r.title),
    description: stripHtml(r.description),
  }));

  const localeTag = String((quiz as any).locale ?? "fr");
  const isFr = localeTag.toLowerCase().startsWith("fr");

  const targetTitle = resultsJson[targetResultIndex]?.title || `Résultat ${targetResultIndex + 1}`;

  const systemPrompt = isFr
    ? `Tu es un expert en design de quiz de personnalité. Ton rôle : rendre atteignable un résultat sous-représenté d'un quiz EXISTANT, SANS modifier le texte des questions, des options ou des résultats existants. Deux leviers, dans cet ordre : (1) réassigner le "result_index" des options qui correspondent SÉMANTIQUEMENT le mieux au résultat cible ; (2) quand une question offre moins de réponses qu'il n'y a de profils, AJOUTER la réponse qui manque au profil cible, rédigée dans la langue, le ton et la forme d'adresse du quiz. Garde un équilibre raisonnable pour les autres résultats — chaque résultat doit avoir au moins ${expected} questions qui mènent à lui.`
    : `You are a personality-quiz design expert. Your job: make an under-represented result reachable on an EXISTING quiz, WITHOUT rewriting any existing question, option, or result text. Two levers, in this order: (1) reassign the "result_index" of the options that semantically fit the target result best; (2) when a question offers fewer answers than there are profiles, ADD the answer the target profile is missing, written in the quiz's language, tone and address form. Keep a reasonable balance across all results — every result should have at least ${expected} questions leading to it.`;

  const userPrompt = isFr
    ? `Quiz actuel (${N} questions, ${R} résultats) :

QUESTIONS :
${JSON.stringify(questionsJson, null, 2)}

RÉSULTATS :
${JSON.stringify(resultsJson, null, 2)}

OBJECTIF : faire en sorte que le résultat à l'index ${targetResultIndex} ("${targetTitle}") soit atteignable. Il doit recevoir au moins ${expected} options pointant vers lui (idéalement une option par question minimum sur ${expected} questions différentes).

${intent ? `INTENTION DE L'AUTRICE : "${intent}"\n` : ""}${shortQuestions.length > 0 ? `RÉPONSES MANQUANTES :
Ces questions offrent moins de réponses qu'il n'y a de profils (${R}), et aucune ne mène au profil cible. Un visiteur ne peut donc PAS choisir ce profil à ces questions : index ${shortQuestions.map((q) => q.index).join(", ")}.
Pour chacune, AJOUTE une réponse qui mène au profil cible, dans "additions". Le texte doit être écrit dans la même langue, le même ton et la même forme d'adresse que les réponses existantes de cette question, avoir la même longueur environ, et être une vraie alternative plausible (jamais une reformulation d'une réponse déjà présente, jamais le nom du profil).
` : ""}RÈGLES STRICTES :
- NE RÉÉCRIS PAS le texte des questions, des options existantes, ni des résultats.
- Dans "changes", ne mets QUE les options dont le result_index doit changer : question_index, option_index, from (l'ancien result_index), to (le nouveau).
- Dans "additions", ne mets QUE des réponses NOUVELLES : question_index, text, result_index.
- N'ajoute JAMAIS de question. Le nombre de questions est un choix de l'autrice.
- Choisis les options qui correspondent sémantiquement au résultat cible (et aux autres si tu en réassignes).
- Garde tous les résultats atteignables, pas seulement le résultat cible.

Réponds STRICTEMENT en JSON valide, sans texte autour, dans ce format exact :
{
  "changes": [
    { "question_index": 0, "option_index": 1, "from": 0, "to": ${targetResultIndex} }
  ],
  "additions": [
    { "question_index": 2, "text": "La réponse qui manquait", "result_index": ${targetResultIndex} }
  ],
  "rationale": "Une phrase courte expliquant la logique générale."
}`
    : `Current quiz (${N} questions, ${R} results):

QUESTIONS:
${JSON.stringify(questionsJson, null, 2)}

RESULTS:
${JSON.stringify(resultsJson, null, 2)}

GOAL: make the result at index ${targetResultIndex} ("${targetTitle}") reachable. It must receive at least ${expected} options pointing to it (ideally at least one option each on ${expected} different questions).

${intent ? `AUTHOR INTENT: "${intent}"\n` : ""}${shortQuestions.length > 0 ? `MISSING ANSWERS:
These questions offer fewer answers than there are profiles (${R}), and none of them leads to the target profile, so a visitor simply cannot pick it there: index ${shortQuestions.map((q) => q.index).join(", ")}.
For each one, ADD an answer leading to the target profile, in "additions". Write it in the same language, tone and address form as that question's existing answers, at roughly the same length, as a genuine plausible alternative (never a rewording of an existing answer, never the profile's name).
` : ""}STRICT RULES:
- DO NOT rewrite existing question, option, or result text.
- In "changes", return ONLY options whose result_index must change: question_index, option_index, from (the previous result_index), to (the new one).
- In "additions", return ONLY brand-new answers: question_index, text, result_index.
- NEVER add a question. How many questions there are is the author's choice.
- Pick options that semantically match the target result (and any others you reassign).
- Keep every result reachable, not just the target.

Respond STRICTLY with valid JSON, no surrounding text, in this exact shape:
{
  "changes": [
    { "question_index": 0, "option_index": 1, "from": 0, "to": ${targetResultIndex} }
  ],
  "additions": [
    { "question_index": 2, "text": "The answer that was missing", "result_index": ${targetResultIndex} }
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
        // 3000 depuis que la reponse peut porter des ajouts (du texte
        // redige), et plus seulement des paires d'entiers.
        max_tokens: 3000,
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

  // Meme severite pour les AJOUTS. Une reponse inventee est du contenu
  // que le visiteur va lire : on n'en laisse passer aucune qui soit vide,
  // hors sujet, ou qui deborde du nombre de profils.
  const safeAdditions: RebalanceAddition[] = [];
  const addedPerQuestion = new Map<number, number>();
  if (Array.isArray(parsed.additions)) {
    for (const raw of parsed.additions) {
      const qi = Number((raw as any).question_index);
      const ri = Number((raw as any).result_index);
      const text = String((raw as any).text ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 300);
      if (!text) continue;
      if (!Number.isInteger(qi) || qi < 0 || qi >= N) continue;
      if (!Number.isInteger(ri) || ri < 0 || ri >= R) continue;
      const q = questionsJson[qi];
      if (q.question_type !== "multiple_choice" || q.options.length === 0) continue;
      // Uniquement la ou il y avait vraiment un trou : pas de reponse en
      // plus sur une question qui propose deja un choix par profil.
      if (q.options.length >= R) continue;
      // Et pas une deuxieme reponse vers le profil cible s'il y menait deja.
      if (q.options.some((o: { result_index: number }) => o.result_index === ri)) continue;
      // Jamais au dela d'une reponse par profil.
      const already = addedPerQuestion.get(qi) ?? 0;
      if (q.options.length + already >= R) continue;
      // Ni un doublon d'une reponse existante, ni d'une reponse deja
      // ajoutee dans le meme lot.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (q.options.some((o: { text: string }) => norm(o.text) === norm(text))) continue;
      if (safeAdditions.some((a) => a.question_index === qi && norm(a.text) === norm(text))) continue;
      safeAdditions.push({ question_index: qi, text, result_index: ri });
      addedPerQuestion.set(qi, already + 1);
    }
  }

  return NextResponse.json({
    ok: true,
    changes: safeChanges,
    additions: safeAdditions,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : null,
    target_result_index: targetResultIndex,
  });
}
