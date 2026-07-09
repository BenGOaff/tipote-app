// lib/quiz/insights.ts (Tipote)
//
// Analyse IA STRATÉGIQUE d'un quiz ou d'un sondage : au-dela du detail
// des reponses (survey/analysis.ts), on donne a Claude le FUNNEL complet
// (visites, completion, capture), la distribution par profil de resultat,
// le drop-off par question et la distribution des reponses, pour produire
// un compte-rendu exploitable pour capter et vendre plus.
//
// Porte de Tiquiz, adapte au modele Tipote : leads dans la table `leads`
// (source='quiz', source_id=quizId, exported_sio), reponses de sondage
// dans quiz_leads (via aggregateSurvey). Appel Claude direct (tier opus).

import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { buildClaudeMessageBody } from "@/lib/claudeRequest";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { aggregateSurvey, type AggregatedQuestion } from "@/lib/survey/analysis";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export const INSIGHTS_MIN_LEADS = 5;
export const INSIGHTS_MIN_VIEWS = 20;

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    ""
  );
}
function getAnalysisModel(): string {
  return resolveAnthropicModel(process.env.TIPOTE_SURVEY_AI_MODEL || process.env.ANTHROPIC_MODEL, "opus");
}

export interface QuizInsightsAggregate {
  title: string;
  mode: "quiz" | "survey";
  metrics: {
    views: number;
    viewsReliable: boolean;
    completions: number;
    completionRate: number | null;
    leads: number;
    captureRate: number | null;
    exportedSio: number;
  };
  resultDistribution: { title: string; count: number; pct: number }[];
  funnel: { index: number; text: string; views: number; answers: number; dropPct: number }[];
  questions: AggregatedQuestion[];
  totalAnswered: number;
}

export interface QuizInsightsResult {
  summary: string;
  funnel: string;
  audience: string;
  improvements: string[];
  actions: string[];
  stats_at_generation: { views: number; leads: number; completions: number };
  model: string;
  generated_at: string;
}

/** Agrege tout ce dont l'IA a besoin. `userId` scope la securite. */
export async function aggregateQuizInsights(
  quizId: string,
  userId: string,
): Promise<QuizInsightsAggregate | null> {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, mode, views_count, completions_count")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;

  const mode = (String(quiz.mode ?? "quiz") === "survey" ? "survey" : "quiz") as "quiz" | "survey";

  // ── Leads (lifetime) + export SIO : table `leads` (modele Tipote) ──
  const [{ count: leadsCount }, { count: exportedCount }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "quiz")
      .eq("source_id", quizId),
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "quiz")
      .eq("source_id", quizId)
      .eq("exported_sio", true),
  ]);
  const leads = leadsCount ?? 0;
  const exported = exportedCount ?? 0;

  // ── Vues + completions : max(compteur denormalise, quiz_events) ──
  const [viewsEv, completesEv] = await Promise.all([
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "view"),
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "complete"),
  ]);
  const trackedViews = Math.max((quiz.views_count as number) ?? 0, viewsEv.error ? 0 : viewsEv.count ?? 0);
  const completions = Math.max((quiz.completions_count as number) ?? 0, completesEv.error ? 0 : completesEv.count ?? 0);

  const viewsReliable = trackedViews >= leads;
  const views = Math.max(trackedViews, leads);
  const captureRate = viewsReliable && views > 0 ? Math.round((leads / views) * 1000) / 10 : null;
  const completionRate = viewsReliable && views > 0 ? Math.round((completions / views) * 1000) / 10 : null;

  // ── Distribution par resultat (regle CLAUDE.md, quiz uniquement) ──
  const resultDistribution: { title: string; count: number; pct: number }[] = [];
  if (mode === "quiz") {
    const [byResultRes, currentRes] = await Promise.all([
      supabaseAdmin.rpc("quiz_leads_by_result", { p_user_id: userId, p_quiz_id: quizId, p_since: null }),
      supabaseAdmin.from("quiz_results").select("id, title").eq("quiz_id", quizId),
    ]);
    const byResultRows = (byResultRes.data ?? []) as {
      result_id: string | null;
      result_title: string | null;
      n: number;
    }[];
    const currentResults = (currentRes.data ?? []) as { id: string; title: string | null }[];
    const currentTitleById = new Map(currentResults.map((r) => [r.id, (r.title ?? "").trim()]));
    const currentTitles = new Set(currentResults.map((r) => (r.title ?? "").trim()).filter(Boolean));

    const NO_RESULT = "__no_result__";
    const byResult = new Map<string, { count: number; snapshotTitle: string | null }>();
    for (const r of byResultRows) {
      const key = r.result_id ?? NO_RESULT;
      const b = byResult.get(key) ?? { count: 0, snapshotTitle: null };
      b.count += Number(r.n);
      if (!b.snapshotTitle && r.result_title?.trim()) b.snapshotTitle = r.result_title.trim();
      byResult.set(key, b);
    }
    const byTitle = new Map<string, number>();
    for (const t of currentTitles) byTitle.set(t, 0);
    for (const [key, b] of byResult) {
      const live = key !== NO_RESULT ? currentTitleById.get(key) : undefined;
      if (live && currentTitles.has(live)) byTitle.set(live, (byTitle.get(live) ?? 0) + b.count);
      else if (b.snapshotTitle && currentTitles.has(b.snapshotTitle))
        byTitle.set(b.snapshotTitle, (byTitle.get(b.snapshotTitle) ?? 0) + b.count);
    }
    let matched = 0;
    for (const v of byTitle.values()) matched += v;
    for (const [title, count] of byTitle.entries())
      resultDistribution.push({
        title,
        count,
        pct: matched > 0 ? Math.round((count / matched) * 1000) / 10 : 0,
      });
    resultDistribution.sort((a, b) => b.count - a.count);
  }

  // ── Drop-off par question ──
  const funnel: QuizInsightsAggregate["funnel"] = [];
  try {
    const { data: funnelRows } = await supabaseAdmin.rpc("quiz_question_funnel_detail", {
      p_quiz_id: quizId,
      p_since: null,
    });
    const rows = (funnelRows ?? []) as { question_index: number; views: number; answers: number }[];
    const { data: qRows } = await supabaseAdmin
      .from("quiz_questions")
      .select("question_text, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order", { ascending: true });
    const texts = (qRows ?? []).map((q) =>
      stripHtml(String((q as { question_text?: string }).question_text ?? "")).trim(),
    );
    let prev = 0;
    rows.forEach((r, i) => {
      const v = Number(r.views);
      const drop = i === 0 || prev === 0 ? 0 : Math.max(0, Math.round(((prev - v) / prev) * 1000) / 10);
      funnel.push({
        index: r.question_index,
        text: texts[r.question_index] || `Question ${r.question_index + 1}`,
        views: v,
        answers: Number(r.answers),
        dropPct: drop,
      });
      prev = v;
    });
  } catch {
    // RPC absente : funnel vide, non bloquant.
  }

  const survey = await aggregateSurvey(quizId, userId);

  return {
    title: stripHtml(String(quiz.title ?? "")).trim() || "Sans titre",
    mode,
    metrics: { views, viewsReliable, completions, completionRate, leads, captureRate, exportedSio: exported },
    resultDistribution,
    funnel,
    questions: survey?.questions ?? [],
    totalAnswered: survey?.totalResponses ?? 0,
  };
}

function renderAggregateForPrompt(a: QuizInsightsAggregate): string {
  const m = a.metrics;
  const lines: string[] = [
    `${a.mode === "survey" ? "Sondage" : "Quiz"} : "${a.title}"`,
    "",
    "CHIFFRES (cumul depuis le debut) :",
    `- Vues${m.viewsReliable ? "" : " (partiellement trackees, taux a interpreter avec prudence)"} : ${m.views}`,
    `- Completions : ${m.completions}${m.completionRate !== null ? ` (${m.completionRate}% des vues)` : ""}`,
    `- Leads captures : ${m.leads}${m.captureRate !== null ? ` (taux de capture ${m.captureRate}% des vues)` : " (taux de capture non fiable : vues incompletes)"}`,
    `- Leads exportes vers Systeme.io : ${m.exportedSio}`,
    "",
  ];
  if (a.resultDistribution.length > 0) {
    lines.push("PROFILS DE RESULTAT (repartition des leads) :");
    for (const r of a.resultDistribution) lines.push(`- ${r.title} : ${r.pct}% (${r.count})`);
    lines.push("");
  }
  if (a.funnel.length > 0) {
    lines.push("DROP-OFF PAR QUESTION (sessions atteignant chaque question) :");
    for (const f of a.funnel)
      lines.push(`- Q${f.index + 1} ${f.text} : ${f.views} vues, ${f.answers} reponses${f.dropPct > 0 ? `, ${f.dropPct}% de perte vs la question precedente` : ""}`);
    lines.push("");
  }
  if (a.questions.length > 0) {
    lines.push(`DISTRIBUTION DES REPONSES (${a.totalAnswered} participants ayant repondu) :`);
    for (const q of a.questions) {
      lines.push(`Q${q.index + 1}. ${q.text}  [${q.answeredCount}/${a.totalAnswered} ont repondu]`);
      for (const o of q.options) lines.push(`   - ${o.text} : ${o.pct}% (${o.count})`);
      if (q.average !== null && q.average !== undefined) lines.push(`   (note moyenne : ${q.average})`);
      if (q.textCount && q.textCount > 0) {
        const samples = (q.textSamples ?? []).slice(0, 12).map((s) => `"${s}"`).join(", ");
        lines.push(`   ${q.textCount} reponses libres. Echantillon : ${samples}`);
      }
    }
  }
  return lines.join("\n");
}

/** Appelle Claude (Opus) pour l'analyse strategique structuree. */
export async function generateQuizInsights(aggregate: QuizInsightsAggregate): Promise<QuizInsightsResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error("Claude API key missing");
  const model = getAnalysisModel();

  const system = [
    "Tu es un stratege d'acquisition qui aide un createur a tirer le maximum de son quiz (ou sondage) pour CAPTER et VENDRE plus.",
    "Tu t'appuies sur les bonnes pratiques d'un quiz lead-magnet : un quiz est une machine a leads (viser 20 a 50% de capture, pas 2% comme un PDF), on capture au pic de curiosite, chaque profil de resultat est un segment que l'on peut adresser avec une offre dediee, et on ameliore en continu en lisant le funnel (le point de fuite unique a corriger en priorite).",
    "Tu reponds en francais, ton direct et concret, tutoiement. Aucune formule d'introduction, aucun remplissage : chaque phrase est actionnable ou revelatrice.",
    "Tu te bases UNIQUEMENT sur les chiffres fournis, sans jamais inventer de donnees.",
    "REGLES de lecture des chiffres :",
    "- Un taux de capture sous ~10% = fuite a corriger (capture mal placee, promesse du resultat trop faible). 20%+ = bon, 40%+ = excellent.",
    "- La question avec le plus gros drop-off est le point de fuite prioritaire : trop longue, trop intrusive, ou mal placee.",
    "- Un profil de resultat sur-represente peut signaler une cible reelle a exploiter (offre dediee) OU un quiz mal equilibre : tranche selon le contexte.",
    "- Si les vues sont partiellement trackees, ne conclus pas sur le taux de capture, concentre-toi sur les leads et les profils.",
    "- Ne dis JAMAIS qu'une question est vide si des reponses sont indiquees.",
    "Tu reponds STRICTEMENT en JSON valide, sans texte autour, au format :",
    '{ "summary": string, "funnel": string, "audience": string, "improvements": string[], "actions": string[] }',
    "- summary : 2 a 4 phrases, le diagnostic global honnete.",
    "- funnel : 2 a 4 phrases sur le parcours (vues -> completion -> capture), ou on perd des gens et pourquoi.",
    "- audience : 2 a 4 phrases sur le profil des visiteurs deduit des resultats et des reponses. Si aucune donnee de profil, dis-le et propose comment en obtenir.",
    "- improvements : 3 a 5 axes d'amelioration concrets, priorises (le point de fuite d'abord).",
    "- actions : 3 a 5 actions a l'imperatif pour capter et vendre plus (offre par profil, relance, coupon, sequence email, ajustement du quiz).",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: controller.signal,
      body: JSON.stringify(
        buildClaudeMessageBody({
          model,
          max_tokens: 2000,
          temperature: 0.4,
          system,
          messages: [{ role: "user", content: renderAggregateForPrompt(aggregate) }],
        }),
      ),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
  const parsed = parseInsightsJson(raw);

  return {
    ...parsed,
    stats_at_generation: {
      views: aggregate.metrics.views,
      leads: aggregate.metrics.leads,
      completions: aggregate.metrics.completions,
    },
    model,
    generated_at: new Date().toISOString(),
  };
}

function parseInsightsJson(raw: string): {
  summary: string;
  funnel: string;
  audience: string;
  improvements: string[];
  actions: string[];
} {
  let jsonStr = raw.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  if (!jsonStr.startsWith("{")) {
    const s = jsonStr.indexOf("{");
    const e = jsonStr.lastIndexOf("}");
    if (s >= 0 && e > s) jsonStr = jsonStr.slice(s, e + 1);
  }
  const toArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => sanitizeAiText(String(x).trim())).filter(Boolean) : [];
  const toStr = (v: unknown): string => (typeof v === "string" ? sanitizeAiText(v.trim()) : "");
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      summary: toStr(obj.summary),
      funnel: toStr(obj.funnel),
      audience: toStr(obj.audience),
      improvements: toArr(obj.improvements),
      actions: toArr(obj.actions),
    };
  } catch {
    return { summary: sanitizeAiText(raw.slice(0, 800)), funnel: "", audience: "", improvements: [], actions: [] };
  }
}
