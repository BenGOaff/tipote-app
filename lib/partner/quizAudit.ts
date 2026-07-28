// lib/partner/quizAudit.ts
// Structure des quiz d'un compte Tipote pour le pont L'Atelier du Quiz
// (Quiz Doctor + generateur d'emails par profil). Lecture seule. Miroir de
// lib/partner/quizAudit.ts cote Tiquiz : meme forme de reponse.
// On ne renvoie que la structure et les reglages du quiz + les profils de
// resultat (titre + description + CTA) : aucune donnee perso de lead.
//
// On exclut les sondages (mode = 'survey') : ils n'ont pas de profils de
// resultat, l'audit "aucun profil" n'aurait pas de sens pour eux. On garde
// 'quiz' et 'scoring' (les deux ont des profils).
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface PartnerQuizResultProfile {
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
}

export interface PartnerQuizStruct {
  id: string;
  title: string;
  status: string;
  mode: string;
  questions: number;
  results: number;
  resultsWithImage: number;
  captureEnabled: boolean;
  askFirstName: boolean;
  viralityEnabled: boolean;
  hasBonus: boolean;
  hasOgImage: boolean;
  views: number;
  resultProfiles: PartnerQuizResultProfile[];
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export interface PartnerAuditScope {
  quizId?: string | null;
  projectId?: string | null;
}

export async function getPartnerQuizAudit(
  userId: string,
  scope?: PartnerAuditScope,
): Promise<PartnerQuizStruct[]> {
  let query = supabaseAdmin
    .from("quizzes")
    .select(
      "id, title, status, mode, capture_enabled, ask_first_name, virality_enabled, og_image_url, bonus_description, bonus_image_url, views_count",
    )
    .eq("user_id", userId)
    .in("mode", ["quiz", "scoring"]);
  if (scope?.quizId) query = query.eq("id", scope.quizId);
  else if (scope?.projectId) query = query.eq("project_id", scope.projectId);
  const { data: quizzes } = await query;

  const rows = quizzes ?? [];
  const ids = rows.map((q) => q.id as string);
  if (ids.length === 0) return [];

  // Comptage des questions par quiz (une seule requete, agregee en memoire).
  const questionsByQuiz = new Map<string, number>();
  {
    const { data: questions } = await supabaseAdmin
      .from("quiz_questions")
      .select("quiz_id")
      .in("quiz_id", ids);
    for (const q of questions ?? []) {
      const qid = q.quiz_id as string;
      questionsByQuiz.set(qid, (questionsByQuiz.get(qid) ?? 0) + 1);
    }
  }

  // Profils de resultat par quiz (titre + description + image + CTA), ordonnes.
  const resultsByQuiz = new Map<
    string,
    {
      title: string;
      description: string;
      hasImage: boolean;
      ctaText: string;
      ctaUrl: string;
      sort: number;
    }[]
  >();
  {
    const { data: results } = await supabaseAdmin
      .from("quiz_results")
      .select("quiz_id, title, description, image_url, cta_text, cta_url, sort_order")
      .in("quiz_id", ids);
    for (const r of results ?? []) {
      const qid = r.quiz_id as string;
      const arr = resultsByQuiz.get(qid) ?? [];
      arr.push({
        title: (r.title as string) ?? "",
        description: (r.description as string) ?? "",
        hasImage: nonEmpty(r.image_url),
        ctaText: (r.cta_text as string) ?? "",
        ctaUrl: (r.cta_url as string) ?? "",
        sort: Number(r.sort_order) || 0,
      });
      resultsByQuiz.set(qid, arr);
    }
  }

  return rows.map((q) => {
    const qid = q.id as string;
    const rs = (resultsByQuiz.get(qid) ?? []).sort((a, b) => a.sort - b.sort);
    return {
      id: qid,
      title: (q.title as string) ?? "",
      status: (q.status as string) ?? "draft",
      mode: (q.mode as string) ?? "quiz",
      questions: questionsByQuiz.get(qid) ?? 0,
      results: rs.length,
      resultsWithImage: rs.filter((r) => r.hasImage).length,
      captureEnabled: q.capture_enabled === true,
      askFirstName: q.ask_first_name === true,
      viralityEnabled: q.virality_enabled === true,
      hasBonus: nonEmpty(q.bonus_description) || nonEmpty(q.bonus_image_url),
      hasOgImage: nonEmpty(q.og_image_url),
      views: Number(q.views_count) || 0,
      resultProfiles: rs.map((r) => ({
        title: r.title,
        description: r.description,
        ctaText: r.ctaText,
        ctaUrl: r.ctaUrl,
      })),
    };
  });
}
