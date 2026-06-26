// lib/survey/format.ts (Tipote)
//
// Formatage type-aware des réponses de sondage en libellés lisibles.
// SOURCE UNIQUE DE VÉRITÉ, partagée par l'export CSV, l'agrégat IA et le
// tableau "Réponses" par répondant. Évite que le bug "Option 1" réapparaisse
// dans une seule des implémentations (drame récurrent : ré-implémentation
// partielle).
//
// Pourquoi c'est nécessaire : une réponse est stockée sous une forme brute
// ({ option_index } | { option_indices } | { rating } | { stars } | { text })
// et le LIBELLÉ dépend du question_type. Les questions yes_no ne portent
// AUCUNE option en base (le Oui/Non est rendu depuis la locale du visiteur),
// donc lire options[idx].text aveuglément renvoyait vide -> fallback
// "Option N". Idem pour rating/stars/free_text qui n'ont pas d'options.
//
// Pas de dépendance serveur ici : utilisable côté client (tableau Réponses)
// ET côté serveur (route CSV + agrégat IA).

import { stripHtml } from "@/lib/richText";

export type SurveyQuestionLike = {
  question_text?: string | null;
  question_type?: string | null;
  options?: Array<{ text?: string | null }> | null;
  config?: Record<string, unknown> | null;
};

export type SurveyAnswerLike = {
  question_index?: number;
  option_index?: number;
  option_indices?: number[];
  rating?: number;
  stars?: number;
  text?: string;
};

// Oui/Non par locale de CONTENU, miroir des libellés affichés aux répondants
// dans PublicQuizClient. Fallback français.
const YES_NO: Record<string, { yes: string; no: string }> = {
  fr: { yes: "Oui", no: "Non" },
  en: { yes: "Yes", no: "No" },
  es: { yes: "Sí", no: "No" },
  de: { yes: "Ja", no: "Nein" },
  pt: { yes: "Sim", no: "Não" },
  it: { yes: "Sì", no: "No" },
  ar: { yes: "نعم", no: "لا" },
};

export function localizedYesNo(locale?: string | null): { yes: string; no: string } {
  const key = String(locale ?? "fr").slice(0, 2).toLowerCase();
  return YES_NO[key] ?? YES_NO.fr;
}

function optionText(question: SurveyQuestionLike, oi: number): string {
  const opt = Array.isArray(question.options) ? question.options[oi] : undefined;
  return stripHtml(String(opt?.text ?? "")).trim();
}

/**
 * Indique si une réponse contient une vraie saisie (pour distinguer
 * "a répondu" de "a sauté la question").
 */
export function isAnswered(answer: SurveyAnswerLike | null | undefined): boolean {
  if (!answer) return false;
  if (typeof answer.option_index === "number") return true;
  if (Array.isArray(answer.option_indices) && answer.option_indices.length > 0) return true;
  if (typeof answer.rating === "number") return true;
  if (typeof answer.stars === "number") return true;
  if (typeof answer.text === "string" && answer.text.trim().length > 0) return true;
  return false;
}

/**
 * Formate une réponse en une chaîne d'affichage pour la question donnée.
 * Retourne "" quand le répondant n'a pas répondu à cette question.
 */
export function formatSurveyAnswer(
  question: SurveyQuestionLike,
  answer: SurveyAnswerLike | null | undefined,
  locale?: string | null,
): string {
  if (!answer) return "";
  const type = String(question.question_type ?? "multiple_choice");

  if (type === "yes_no") {
    const { yes, no } = localizedYesNo(locale);
    if (answer.option_index === 0) return yes;
    if (answer.option_index === 1) return no;
    return "";
  }

  if (type === "rating_scale" || type === "star_rating") {
    const v =
      typeof answer.rating === "number"
        ? answer.rating
        : typeof answer.stars === "number"
          ? answer.stars
          : null;
    return v === null ? "" : String(v);
  }

  if (type === "free_text") {
    return typeof answer.text === "string" ? answer.text.trim() : "";
  }

  // multiple_choice / image_choice (et tout type "à choix" par défaut).
  if (Array.isArray(answer.option_indices)) {
    return answer.option_indices
      .map((oi) => optionText(question, oi) || `Option ${oi + 1}`)
      .join(" | ");
  }
  if (typeof answer.option_index === "number") {
    return optionText(question, answer.option_index) || `Option ${answer.option_index + 1}`;
  }
  // Tolérance : certaines réponses "à choix" peuvent arriver en texte/note.
  if (typeof answer.text === "string") return answer.text.trim();
  if (typeof answer.rating === "number") return String(answer.rating);
  return "";
}

/**
 * Construit une Map question_index -> réponse pour un répondant, à partir de
 * son tableau brut `answers`.
 */
export function indexAnswers(
  answers: SurveyAnswerLike[] | null | undefined,
): Map<number, SurveyAnswerLike> {
  const byQ = new Map<number, SurveyAnswerLike>();
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (typeof a?.question_index === "number") byQ.set(a.question_index, a);
    }
  }
  return byQ;
}
