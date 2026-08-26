// lib/survey/analysis.ts
//
// Agrégation des réponses d'un sondage + génération de l'analyse IA.
// Partagé entre l'export (CSV/PDF) et l'analyse IA.
//
// Source de vérité : quiz_leads.answers (JSONB), array d'objets
// { question_index, option_index?, option_indices?, rating?, text? }.
// Mêmes conventions que /aggregate-responses.

import { PRIORITY_RULES, capSecondary } from "@/lib/prompts/priority";
import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { callClaude, getClaudeApiKey } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { localizedYesNo, isAnswered } from "@/lib/survey/format";
import { buildQuestionPositions, resolveQuestionPosition } from "@/lib/quiz/questionIdentity";
import { fetchAllRows } from "@/lib/db/fetchAllRows";
import { EVIDENCE_RULES } from "@/lib/prompts/evidence";
import {
  ANSWER_READING_RULES,
  estMultiSelect,
  renderQuestionsForPrompt,
  resoudreEchelle,
  type EchelleRendue,
} from "@/lib/survey/renderQuestions";

// Analyse de sondage = CONTENU exploitable (enseignements + actions).
// Béné (juin 2026) : le contenu utilise toujours le meilleur Claude
// dispo → tier "opus" (claude-opus-4-8), pas le sonnet par défaut.
// Override possible via TIPOTE_SURVEY_AI_MODEL.
function resolveSurveyAnalysisModel(): string {
  return resolveAnthropicModel(process.env.TIPOTE_SURVEY_AI_MODEL, "opus");
}

export const SURVEY_AI_MIN_RESPONSES = 5;

/** Réponses libres gardées en mémoire par question, avant échantillonnage. */
const MAX_TEXTES_GARDES = 200;

export interface SurveyAnswerRaw {
  question_index?: number;
  /** Identité stable de la question (cf. lib/quiz/questionIdentity.ts). */
  question_id?: string | null;
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
  /** Bornes et libellés d'une échelle. Une moyenne sans son échelle ne
   *  veut rien dire (cf. lib/survey/renderQuestions.ts). */
  echelle?: EchelleRendue | null;
  /** Répartition des notes, valeur par valeur : une moyenne seule cache
   *  une audience coupée en deux. */
  notes?: { valeur: number; count: number }[] | null;
  /** `config.multi_select` : les % se cumulent au delà de 100. */
  multiSelect?: boolean;
  /** Nombre de répondants ayant RÉELLEMENT répondu à cette question. */
  answeredCount: number;
}

export interface SurveyAggregate {
  totalResponses: number;
  questions: AggregatedQuestion[];
}

export interface SurveyAnalysisResult {
  summary: string;
  /** LA chose a faire maintenant, une seule (cf. lib/prompts/priority.ts). */
  priority: { title: string; why: string; how: string } | null;
  takeaways: string[];
  actions: string[];
  responses_at_generation: number;
  model: string;
  generated_at: string;
}

interface QuestionRow {
  id: string;
  question_text: string | null;
  options: Array<{ text?: string }> | null;
  sort_order: number;
  question_type: string | null;
  /** JSONB par type : bornes d'une échelle, libellés, multi_select. */
  config: Record<string, unknown> | null;
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
    .select("id, question_text, options, sort_order, question_type, config")
    .eq("quiz_id", quizId)
    // Tri secondaire sur `id` : miroir EXACT du row_number() de la RPC SQL,
    // pour que la position calculée ici soit la même partout en cas
    // d'égalité de sort_order sur d'anciennes lignes.
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  const questions = (questionsRaw ?? []) as QuestionRow[];
  // Identité stable : `question_id` -> position ACTUELLE. Sans ça, l'IA
  // analysait les réponses de Q6 sous le libellé de Q5 dès qu'une question
  // avait été supprimée au milieu (drame Adeline, 1er août 2026).
  const positions = buildQuestionPositions(questions);
  const questionCount = questions.length;

  // Analyse COMPLÈTE (pas de plafond 1000) : pagination serveur, sinon
  // l'IA analyse un échantillon tronqué et fausse ses conclusions.
  const leads = await fetchAllRows<{ answers?: SurveyAnswerRaw[] | null }>((from, to) =>
    supabaseAdmin
      .from("quiz_leads")
      .select("answers")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: true })
      .range(from, to),
  );

  // totals[qi][oi] = count
  const totals: Record<number, Record<number, number>> = {};
  const ratingSums: Record<number, { sum: number; n: number }> = {};
  // Répartition note par note. La moyenne seule ne distingue pas une
  // audience tiède d'une audience coupée en deux (26 août 2026).
  const ratingCounts: Record<number, Record<number, number>> = {};
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
      const qi = resolveQuestionPosition(ans, positions, questionCount);
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
        if (!ratingCounts[qi]) ratingCounts[qi] = {};
        ratingCounts[qi][ratingVal] = (ratingCounts[qi][ratingVal] ?? 0) + 1;
      }
      if (typeof ans.text === "string" && ans.text.trim()) {
        textCounts[qi] = (textCounts[qi] ?? 0) + 1;
        if (!textSamples[qi]) textSamples[qi] = [];
        // On garde large et on échantillonne AU RENDU, réparti sur toute
        // la période : garder les 40 premiers ne montrait que l'audience
        // du jour du lancement.
        if (textSamples[qi].length < MAX_TEXTES_GARDES) textSamples[qi].push(ans.text.trim());
      }
    }
  }

  const yesNo = localizedYesNo(locale);

  const aggregatedQuestions: AggregatedQuestion[] = questions.map((q, idx) => {
    // Les compteurs ci-dessus sont déjà rangés par POSITION ACTUELLE
    // (resolveQuestionPosition), donc l'index du tableau suffit ici.
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
    const echelle = resoudreEchelle(type, q.config);
    const compteurs = ratingCounts[qi] ?? {};
    const notes = echelle
      ? (() => {
          const liste: { valeur: number; count: number }[] = [];
          // On parcourt l'ÉCHELLE, pas les valeurs reçues : une note que
          // PERSONNE n'a donnée est une information (c'est le creux qui
          // révèle une audience coupée en deux), et une valeur absente du
          // tableau serait indistinguable d'une valeur hors échelle.
          for (let v = echelle.min; v <= echelle.max; v++) {
            liste.push({ valeur: v, count: compteurs[v] ?? 0 });
          }
          return liste;
        })()
      : null;
    return {
      index: qi,
      text: stripHtml(String(q.question_text ?? `Question ${qi + 1}`)).trim() || `Question ${qi + 1}`,
      type,
      options,
      textSamples: textSamples[qi],
      textCount: textCounts[qi] ?? 0,
      average: rating && rating.n > 0 ? Math.round((rating.sum / rating.n) * 100) / 100 : null,
      echelle,
      notes,
      multiSelect: estMultiSelect(q.config),
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
    EVIDENCE_RULES,
    ANSWER_READING_RULES,
    PRIORITY_RULES,
    "Tu réponds STRICTEMENT en JSON valide, sans texte autour, au format :",
    '{ "summary": string, "priority": { "title": string, "why": string, "how": string }, "takeaways": string[], "actions": string[] }',
    "- priority.title : LA seule chose à faire maintenant, en une phrase à l'impératif.",
    "- priority.why : 1 à 2 phrases, avec SES chiffres à elle.",
    "- priority.how : 2 à 4 phrases très concrètes sur la manière de s'y prendre.",
    "- summary : 2-4 phrases sur ce que disent VRAIMENT les résultats (les tendances fortes, les surprises).",
    "- takeaways : 3 MAXIMUM, APRÈS la priorité, enseignements concrets à retenir (puces courtes).",
    "- actions : 3 MAXIMUM, jamais un doublon de la priorité, actions concrètes à mettre en place, priorisées, formulées à l'impératif.",
  ].join("\n");

  const lines: string[] = [`Sondage : "${surveyTitle}"`, `Nombre de participants : ${aggregate.totalResponses}`, ""];
  lines.push(...renderQuestionsForPrompt(aggregate.questions, aggregate.totalResponses, { samples: 25 }));

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
    priority: parsed.priority,
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
  priority: { title: string; why: string; how: string } | null;
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
    // Le plafond vit dans le CODE et pas seulement dans la consigne :
    // un modele qui deborde ne doit pas pouvoir re-assommer la creatrice.
    const toStringArray = (v: unknown): string[] =>
      capSecondary(Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    const toStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const pr = (obj.priority ?? null) as Record<string, unknown> | null;
    return {
      summary: toStr(obj.summary),
      priority:
        pr && typeof pr === "object" && toStr(pr.title)
          ? { title: toStr(pr.title), why: toStr(pr.why), how: toStr(pr.how) }
          : null,
      takeaways: toStringArray(obj.takeaways),
      actions: toStringArray(obj.actions),
    };
  } catch {
    // Fallback : on renvoie au moins le texte brut en summary pour ne
    // pas perdre le travail du modèle.
    return { summary: raw.trim().slice(0, 1000), priority: null, takeaways: [], actions: [] };
  }
}
