// lib/survey/analysis.ts
//
// Agrégation des réponses d'un sondage + génération de l'analyse IA.
// Partagé entre l'export (CSV/PDF) et l'analyse IA.
//
// Source de vérité : quiz_leads.answers (JSONB), array d'objets
// { question_index, option_index?, option_indices?, rating?, text? }.
// Mêmes conventions que /aggregate-responses.

import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { callClaude, getClaudeApiKey } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Analyse de sondage = CONTENU exploitable (enseignements + actions).
// Béné (juin 2026) : le contenu utilise toujours le meilleur Claude
// dispo → tier "opus" (claude-opus-4-8), pas le sonnet par défaut.
// Override possible via TIPOTE_SURVEY_AI_MODEL.
function resolveSurveyAnalysisModel(): string {
  return resolveAnthropicModel(process.env.TIPOTE_SURVEY_AI_MODEL, "opus");
}

export const SURVEY_AI_MIN_RESPONSES = 5;

export interface SurveyAnswerRaw {
  question_index?: number;
  option_index?: number;
  option_indices?: number[];
  rating?: number;
  stars?: number;
  text?: string;
}

export interface AggregatedOption {
  text: string;
  count: number;
  pct: number;
}

export interface AggregatedQuestion {
  index: number;
  text: string;
  type: string;
  options: AggregatedOption[];
  /** Échantillon de réponses libres (free_text), cappé. */
  textSamples?: string[];
  /** Moyenne pour les questions rating/stars. */
  average?: number | null;
}

export interface SurveyAggregate {
  totalResponses: number;
  questions: AggregatedQuestion[];
}

export interface SurveyAnalysisResult {
  summary: string;
  takeaways: string[];
  actions: string[];
  responses_at_generation: number;
  model: string;
  generated_at: string;
}

interface QuestionRow {
  question_text: string | null;
  options: Array<{ text?: string }> | null;
  sort_order: number;
  question_type: string | null;
}

/**
 * Agrège toutes les réponses d'un sondage. `userId` scope la sécurité :
 * on vérifie que le quiz appartient bien au user avant d'agréger.
 * Retourne null si le quiz n'existe pas / n'appartient pas au user.
 */
export async function aggregateSurvey(
  quizId: string,
  userId: string,
): Promise<SurveyAggregate | null> {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, mode")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;

  const { data: questionsRaw } = await supabaseAdmin
    .from("quiz_questions")
    .select("question_text, options, sort_order, question_type")
    .eq("quiz_id", quizId)
    .order("sort_order", { ascending: true });
  const questions = (questionsRaw ?? []) as QuestionRow[];

  const { data: leads } = await supabaseAdmin
    .from("quiz_leads")
    .select("answers")
    .eq("quiz_id", quizId);

  // totals[qi][oi] = count
  const totals: Record<number, Record<number, number>> = {};
  const ratingSums: Record<number, { sum: number; n: number }> = {};
  const textSamples: Record<number, string[]> = {};
  let totalResponses = 0;

  for (const lead of leads ?? []) {
    const answers = (lead as { answers?: SurveyAnswerRaw[] | null }).answers;
    if (!Array.isArray(answers)) continue;
    totalResponses += 1;
    for (const ans of answers) {
      const qi = typeof ans.question_index === "number" ? ans.question_index : null;
      if (qi === null) continue;
      if (Array.isArray(ans.option_indices)) {
        if (!totals[qi]) totals[qi] = {};
        for (const oi of ans.option_indices) {
          if (typeof oi === "number") totals[qi][oi] = (totals[qi][oi] ?? 0) + 1;
        }
      } else if (typeof ans.option_index === "number") {
        if (!totals[qi]) totals[qi] = {};
        totals[qi][ans.option_index] = (totals[qi][ans.option_index] ?? 0) + 1;
      }
      const ratingVal =
        typeof ans.rating === "number"
          ? ans.rating
          : typeof ans.stars === "number"
            ? ans.stars
            : null;
      if (ratingVal !== null) {
        if (!ratingSums[qi]) ratingSums[qi] = { sum: 0, n: 0 };
        ratingSums[qi].sum += ratingVal;
        ratingSums[qi].n += 1;
      }
      if (typeof ans.text === "string" && ans.text.trim()) {
        if (!textSamples[qi]) textSamples[qi] = [];
        if (textSamples[qi].length < 30) textSamples[qi].push(ans.text.trim());
      }
    }
  }

  const aggregatedQuestions: AggregatedQuestion[] = questions.map((q, idx) => {
    const qi = q.sort_order ?? idx;
    const optionTexts = Array.isArray(q.options) ? q.options : [];
    const counts = totals[qi] ?? {};
    const options: AggregatedOption[] = optionTexts.map((opt, oi) => {
      const count = counts[oi] ?? 0;
      return {
        text: String(opt?.text ?? `Option ${oi + 1}`),
        count,
        pct: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
      };
    });
    const rating = ratingSums[qi];
    return {
      index: qi,
      text: String(q.question_text ?? `Question ${qi + 1}`),
      type: String(q.question_type ?? "multiple_choice"),
      options,
      textSamples: textSamples[qi],
      average: rating && rating.n > 0 ? Math.round((rating.sum / rating.n) * 100) / 100 : null,
    };
  });

  return { totalResponses, questions: aggregatedQuestions };
}

/**
 * Construit le prompt et appelle Claude pour produire l'analyse
 * structurée. Le modèle reçoit l'agrégat (questions + % par option),
 * et doit répondre en JSON strict { summary, takeaways[], actions[] }.
 */
export async function generateSurveyAnalysis(
  aggregate: SurveyAggregate,
  surveyTitle: string,
): Promise<SurveyAnalysisResult> {
  const model = resolveSurveyAnalysisModel();
  const apiKey = getClaudeApiKey();

  const system = [
    "Tu es un analyste qui aide un entrepreneur à exploiter les résultats d'un sondage.",
    "Tu réponds en français, ton direct et concret, tutoiement.",
    "Tu ne fais JAMAIS de remplissage : chaque phrase doit être actionnable ou révélatrice.",
    "Tu te bases UNIQUEMENT sur les chiffres fournis, sans inventer de données.",
    "Tu réponds STRICTEMENT en JSON valide, sans texte autour, au format :",
    '{ "summary": string, "takeaways": string[], "actions": string[] }',
    "- summary : 2-4 phrases sur ce que disent VRAIMENT les résultats (les tendances fortes, les surprises).",
    "- takeaways : 3 à 5 enseignements concrets à retenir (puces courtes).",
    "- actions : 3 à 5 actions concrètes à mettre en place, priorisées, formulées à l'impératif.",
  ].join("\n");

  const lines: string[] = [`Sondage : "${surveyTitle}"`, `Nombre de réponses : ${aggregate.totalResponses}`, ""];
  for (const q of aggregate.questions) {
    lines.push(`Q${q.index + 1}. ${q.text}`);
    if (q.options.length > 0) {
      for (const o of q.options) {
        lines.push(`   - ${o.text} : ${o.pct}% (${o.count})`);
      }
    }
    if (q.average !== null && q.average !== undefined) {
      lines.push(`   (note moyenne : ${q.average})`);
    }
    if (q.textSamples && q.textSamples.length > 0) {
      lines.push(`   réponses libres : ${q.textSamples.slice(0, 10).map((s) => `"${s}"`).join(", ")}`);
    }
    lines.push("");
  }

  const userPrompt = lines.join("\n");

  const raw = await callClaude({
    apiKey,
    model,
    system,
    user: userPrompt,
    maxTokens: 1500,
    temperature: 0.4,
  });

  const parsed = parseAnalysisJson(raw);
  return {
    summary: parsed.summary,
    takeaways: parsed.takeaways,
    actions: parsed.actions,
    responses_at_generation: aggregate.totalResponses,
    model,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Parse la réponse JSON du modèle de façon défensive (le modèle peut
 * entourer le JSON de texte ou de ```json). On extrait le 1er objet
 * JSON et on normalise les champs.
 */
function parseAnalysisJson(raw: string): {
  summary: string;
  takeaways: string[];
  actions: string[];
} {
  let jsonStr = raw.trim();
  // Retire les fences markdown éventuels.
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  // Sinon, isole du premier { au dernier }.
  if (!jsonStr.startsWith("{")) {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);
  }

  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    return {
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      takeaways: toStringArray(obj.takeaways),
      actions: toStringArray(obj.actions),
    };
  } catch {
    // Fallback : on renvoie au moins le texte brut en summary pour ne
    // pas perdre le travail du modèle.
    return { summary: raw.trim().slice(0, 1000), takeaways: [], actions: [] };
  }
}
