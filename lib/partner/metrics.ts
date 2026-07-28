// lib/partner/metrics.ts
// Agrege les metriques "a vie" d'un compte Tipote pour le pont Atelier du
// Quiz. Lecture seule, chiffres uniquement (aucune donnee perso de lead).
// Miroir de lib/partner/metrics.ts cote Tiquiz : meme forme de reponse,
// pour que l'Atelier consomme les deux apps avec le meme client.
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface PartnerMetrics {
  leads: number;
  views: number;
  completes: number;
  shares: number;
  topQuiz: { title: string; leads: number } | null;
}

export interface PartnerMetricsScope {
  /** Ne garder que ce quiz. */
  quizId?: string | null;
  /** Ne garder que les quiz de ce projet. */
  projectId?: string | null;
}

export async function getPartnerMetrics(
  userId: string,
  scope?: PartnerMetricsScope,
): Promise<PartnerMetrics> {
  let query = supabaseAdmin
    .from("quizzes")
    .select("id, title, views_count, completions_count, shares_count")
    .eq("user_id", userId);
  // Filtre optionnel (selecteur projet/quiz de l'Atelier). On garde le
  // gate user_id : un quiz/projet d'un autre compte ne remonte jamais.
  if (scope?.quizId) query = query.eq("id", scope.quizId);
  else if (scope?.projectId) query = query.eq("project_id", scope.projectId);
  const { data: quizzes } = await query;

  const rows = quizzes ?? [];
  const ids = rows.map((q) => q.id as string);

  // Comptage leads par quiz agrege DANS la base (RPC partner_leads_counts,
  // migration 20260728b) : pas de fetch ligne par ligne plafonne a 1000.
  const leadsByQuiz = new Map<string, number>();
  let leads = 0;
  if (ids.length > 0) {
    const { data: leadCounts } = await supabaseAdmin.rpc("partner_leads_counts", {
      p_quiz_ids: ids,
    });
    for (const r of (leadCounts ?? []) as { quiz_id: string; n: number }[]) {
      const c = Number(r.n) || 0;
      leads += c;
      leadsByQuiz.set(r.quiz_id, c);
    }
  }

  const views = rows.reduce((a, q) => a + (Number(q.views_count) || 0), 0);
  const completes = rows.reduce((a, q) => a + (Number(q.completions_count) || 0), 0);
  const shares = rows.reduce((a, q) => a + (Number(q.shares_count) || 0), 0);

  let topQuiz: { title: string; leads: number } | null = null;
  for (const q of rows) {
    const l = leadsByQuiz.get(q.id as string) ?? 0;
    if (!topQuiz || l > topQuiz.leads) topQuiz = { title: (q.title as string) ?? "", leads: l };
  }
  if (topQuiz && topQuiz.leads === 0) topQuiz = null;

  return { leads, views, completes, shares, topQuiz };
}
