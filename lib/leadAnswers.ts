// lib/leadAnswers.ts
//
// Resolution des reponses d'un lead (stockees en INDICES par la capture :
// { question_index, option_index?, option_indices?, text?, rating?, stars? })
// vers du texte lisible { question_text, answer_text } pour la fiche lead.
//
// Sans ca, "Mes leads" affichait une section reponses vide : la donnee
// existe mais en indices, pas en texte (drame Béné 22 juin 2026).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedAnswer {
  question_text: string;
  answer_text: string;
}

interface RawAnswer {
  question_index?: number;
  option_index?: number;
  option_indices?: number[];
  text?: string;
  rating?: number;
  stars?: number;
}

function strip(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resout les reponses brutes d'un lead quiz/sondage en texte lisible en
 * joignant avec les questions/options du quiz source. Tolerant : si le
 * quiz ou une question/option a disparu (suppression, rename), on retombe
 * proprement sur un libelle generique plutot que de planter.
 */
export async function resolveLeadAnswers(
  supabase: SupabaseClient,
  quizId: string | null | undefined,
  raw: unknown,
): Promise<ResolvedAnswer[]> {
  if (!quizId || !Array.isArray(raw) || raw.length === 0) return [];

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("question_text, options, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order", { ascending: true });

  if (!questions || questions.length === 0) return [];

  const out: ResolvedAnswer[] = [];
  for (const a of raw as RawAnswer[]) {
    const qi = typeof a?.question_index === "number" ? a.question_index : -1;
    const q = qi >= 0 ? questions[qi] : null;
    if (!q) continue;

    const questionText = strip(q.question_text) || `Question ${qi + 1}`;
    const options = Array.isArray(q.options) ? (q.options as Array<{ text?: string }>) : [];
    const optText = (i: number) => strip(options[i]?.text) || `Option ${i + 1}`;

    let answer = "";
    if (typeof a.option_index === "number") {
      answer = optText(a.option_index);
    } else if (Array.isArray(a.option_indices) && a.option_indices.length > 0) {
      answer = a.option_indices.map(optText).filter(Boolean).join(", ");
    } else if (typeof a.rating === "number") {
      answer = String(a.rating);
    } else if (typeof a.stars === "number") {
      const n = Math.max(0, Math.min(5, Math.round(a.stars)));
      answer = `${"★".repeat(n)} (${a.stars}/5)`;
    } else if (typeof a.text === "string" && a.text.trim()) {
      answer = a.text.trim();
    }

    if (!answer) continue; // question non repondue : on n'affiche pas
    out.push({ question_text: questionText, answer_text: answer });
  }
  return out;
}
