// lib/insights/history.ts
//
// GARDER CE QUE NOS IA ONT CONSEILLÉ.
//
// -- POURQUOI (4 août 2026) -------------------------------------------
//
// `quizzes.ai_insights` est écrasé à chaque génération, et
// `user_insight_reports` a `user_id` en clé primaire. Il n'existe donc
// nulle part de trace de ce qu'un rapport a dit la fois d'avant.
//
// Quand Jocelyne nous a dit avoir suivi les conseils du robot pendant
// trois semaines, il a fallu une journée pour reconstituer ce qu'il lui
// avait réellement conseillé, à partir de ses messages et d'une
// relecture du prompt. La conclusion est restée incertaine. Une ligne
// d'historique aurait tranché en trente secondes.
//
// -- LA RÈGLE QUI COMPTE ----------------------------------------------
//
// **Écrire l'historique ne doit JAMAIS faire échouer une analyse.**
//
// La table peut manquer (migration pas encore appliquée), la base peut
// refuser, le réseau peut tomber. Dans tous ces cas la créatrice doit
// recevoir son rapport : elle l'a demandé, il est généré, il est payé.
// Perdre son analyse pour une trace de diagnostic serait une régression
// bien pire que le problème qu'on corrige. C'est la même prudence que
// `structure_changed_at` sur la sauvegarde d'un quiz.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ReportScope = "quiz" | "account";

export type RecordedReport = {
  userId: string;
  scope: ReportScope;
  /** L'id du quiz pour `scope: "quiz"`, null pour le rapport global. */
  quizId: string | null;
  report: unknown;
  model?: string | null;
  generatedAt: string;
};

/**
 * Ajoute une ligne d'historique. Best-effort, ne jette jamais.
 *
 * Retourne `true` si la ligne est écrite, `false` sinon. Le booléen sert
 * aux tests et à un éventuel appelant qui voudrait le dire : personne
 * n'est obligé de le regarder, et surtout personne ne doit s'arrêter
 * dessus.
 */
export async function recordAiReport(input: RecordedReport): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from("ai_report_history").insert({
      user_id: input.userId,
      scope: input.scope,
      quiz_id: input.scope === "quiz" ? input.quizId : null,
      report: input.report,
      model: input.model ?? null,
      generated_at: input.generatedAt,
    });
    if (error) {
      // Un warn et pas un error : ce n'est pas un incident pour la
      // créatrice, c'est une trace manquante pour nous.
      console.warn("[insights/history] non enregistre :", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[insights/history] non enregistre :", e instanceof Error ? e.message : e);
    return false;
  }
}
