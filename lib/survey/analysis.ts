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
import { stripHtml } from "@/lib/richText";
import { localizedYesNo, isAnswered } from "@/lib/survey/format";

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
  /** Nombre TOTAL de réponses libres (les textSamples n'en sont qu'un échantillon). */
  textCount?: number;
  /** Moyenne pour les questions rating/stars. */
  average?: number | null;
  /** Nombre de répondants ayant RÉELLEMENT répondu à cette question. */
  answeredCount: number;
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
    .select("id, user_id, mode, locale")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;
  const locale = (quiz as { locale?: string | null }).locale ?? "fr";

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
  const textCounts: Record<number, number> = {};
  // Combien de répondants ont RÉELLEMENT répondu à chaque question. Indispensable
  // pour que l'IA ne déduise pas "personne n'a répondu" (drame 26 juin 2026 :
  // une question yes_no à 100% comptée comme vide car ses options ne sont pas
  // stockées en base).
  const answeredPerQ: Record<number, number> = {};
  let totalResponses = 0;

  for (const lead of leads ?? []) {
    const answers = (lead as { answers?: SurveyAnswerRaw[] | null }).answers;
    if (!Array.isArray(answers)) continue;
    totalResponses += 1;
    for (const ans of answers) {
      const qi = typeof ans.question_index === "number" ? ans.question_index : null;
      if (qi === null) continue;
      if (!isAnswered(ans)) continue;
      answeredPerQ[qi] = (answeredPerQ[qi] ?? 0) + 1;
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
        textCounts[qi] = (textCounts[qi] ?? 0) + 1;
        if (!textSamples[qi]) textSamples[qi] = [];
        if (textSamples[qi].length < 40) textSamples[qi].push(ans.text.trim());
      }
    }
  }

  const yesNo = localizedYesNo(locale);

  const aggregatedQuestions: AggregatedQuestion[] = questions.map((q, idx) => {
    // question_index = position 0-based dans l'ordre sort_order. On aligne sur
    // l'index du tableau (cohérent avec PublicQuizClient + SurveyTrends).
    const qi = idx;
    const type = String(q.question_type ?? "multiple_choice");
    const counts = totals[qi] ?? {};
    const answeredCount = answeredPerQ[qi] ?? 0;
    // Dénominateur = répondants à CETTE question, pour que les % d'une question
    // à choix unique somment à 100% même si certains l'ont sautée.
    const denom = answeredCount > 0 ? answeredCount : 1;
    const pct = (count: number) => Math.round((count / denom) * 1000) / 10;

    let options: AggregatedOption[];
    if (type === "yes_no") {
      // Les questions yes_no ne portent PAS d'options en base : on synthétise
      // Oui/Non depuis la locale + les compteurs option_index 0/1.
      options = [
        { text: yesNo.yes, count: counts[0] ?? 0, pct: pct(counts[0] ?? 0) },
        { text: yesNo.no, count: counts[1] ?? 0, pct: pct(counts[1] ?? 0) },
      ];
    } else if (type === "rating_scale" || type === "star_rating" || type === "free_text") {
      // Pas de distribution par option : la moyenne / les exemples portent
      // l'information (gérés plus bas).
      options = [];
    } else {
      const optionTexts = Array.isArray(q.options) ? q.options : [];
      options = optionTexts.map((opt, oi) => {
        const count = counts[oi] ?? 0;
        return {
          text: stripHtml(String(opt?.text ?? `Option ${oi + 1}`)).trim() || `Option ${oi + 1}`,
          count,
          pct: pct(count),
        };
      });
    }

    const rating = ratingSums[qi];
    return {
      index: qi,
      text: stripHtml(String(q.question_text ?? `Question ${qi + 1}`)).trim() || `Question ${qi + 1}`,
      type,
      options,
      textSamples: textSamples[qi],
      textCount: textCounts[qi] ?? 0,
      average: rating && rating.n > 0 ? Math.round((rating.sum / rating.n) * 100) / 100 : null,
      answeredCount,
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
    "RÈGLE CLÉ sur le comptage :",
    "- Chaque question affiche '[N/T ont répondu]' : N = personnes ayant répondu à CETTE question, T = total des participants. Si N > 0, la question A des réponses : ne dis JAMAIS qu'elle est vide ou sans données.",
    "- Pour une question à réponses libres, le nombre total est donné explicitement ('N réponses libres'). Les exemples cités ne sont qu'un ÉCHANTILLON : n'en déduis pas que seules ces réponses existent, ni que les autres participants n'ont pas répondu.",
    "- Les pourcentages d'une question sont calculés sur les répondants à cette question (pas sur le total), ils somment donc à 100% pour un choix unique.",
    "Tu réponds STRICTEMENT en JSON valide, sans texte autour, au format :",
    '{ "summary": string, "takeaways": string[], "actions": string[] }',
    "- summary : 2-4 phrases sur ce que disent VRAIMENT les résultats (les tendances fortes, les surprises).",
    "- takeaways : 3 à 5 enseignements concrets à retenir (puces courtes).",
    "- actions : 3 à 5 actions concrètes à mettre en place, priorisées, formulées à l'impératif.",
  ].join("\n");

  const lines: string[] = [`Sondage : "${surveyTitle}"`, `Nombre de participants : ${aggregate.totalResponses}`, ""];
  for (const q of aggregate.questions) {
    lines.push(`Q${q.index + 1}. ${q.text}  [${q.answeredCount}/${aggregate.totalResponses} ont répondu]`);
    if (q.options.length > 0) {
      for (const o of q.options) {
        lines.push(`   - ${o.text} : ${o.pct}% (${o.count})`);
      }
    }
    if (q.average !== null && q.average !== undefined) {
      lines.push(`   (note moyenne : ${q.average})`);
    }
    if (q.textCount && q.textCount > 0) {
      const samples = (q.textSamples ?? []).slice(0, 15).map((s) => `"${s}"`).join(", ");
      lines.push(`   ${q.textCount} réponses libres au total. Échantillon : ${samples}`);
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
