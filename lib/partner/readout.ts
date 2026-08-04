// lib/partner/readout.ts
//
// Ce que le coach de l'Atelier reçoit VRAIMENT sur le quiz d'une élève.
//
// -- POURQUOI (Jocelyne, 4 août 2026) ---------------------------------
//
// Elle a passé trois semaines à réparer une question qui n'avait rien,
// en suivant des conseils. On a d'abord cru que le coach lui avait dit
// de travailler sa question 7 ; vérification faite, ça venait du rapport
// IA de Tiquiz. Mais en regardant ce que le coach reçoit, on a trouvé
// pire :
//
//     il ne reçoit AUCUN chiffre de funnel.
//
// Le pont ne transmettait que quatre compteurs cumulés (vues,
// complétions, leads, partages) sur TOUT le compte. Pas de démarrages,
// donc la fuite d'entrée était invisible. Pas de détail par question,
// donc rien à dire de vrai sur une question précise. Et surtout, rien
// ne disait au coach ce qu'il n'avait PAS.
//
// Un modèle à qui on demande d'aider sur des stats qu'il ne voit pas ne
// répond pas "je ne sais pas" : il généralise la méthode, ça sonne
// juste, et l'élève applique. C'est comme ça qu'on fait perdre trois
// semaines à quelqu'un.
//
// -- CE QU'ON ENVOIE, ET POURQUOI C'EST DU TEXTE ----------------------
//
// On envoie les chiffres ET le verdict DÉJÀ RÉDIGÉ, avec les mêmes
// fonctions que l'écran de stats de Tiquiz (`renderFullFunnelVerdict`,
// `renderTrafficForPrompt`).
//
// Envoyer des pourcentages bruts et laisser l'Atelier les relire, ce
// serait refaire pour la septième fois le défaut qui nous poursuit :
// deux endroits qui recalculent la même décision finissent toujours par
// dire deux choses différentes. Ici, l'écran que l'élève regarde et le
// coach à qui elle parle disent forcément la même chose, parce que
// c'est la même phrase.
//
// -- ET ON DIT CE QU'ON NE SAIT PAS -----------------------------------
//
// Le verdict n'existe que pour UN quiz. Sur un compte qui en a
// plusieurs, un funnel agrégé ne veut rien dire : additionner les
// questions 3 de cinq quiz différents ne produit aucune information.
// Dans ce cas `scope` vaut "account" et le coach sait qu'il doit
// demander de choisir un quiz avant de commenter quoi que ce soit.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { buildLiveFunnel } from "@/lib/quiz/funnel";
import { readFunnelSignal, type FunnelSignal, type FunnelStepLike } from "@/lib/quiz/funnelSignal";
import { biggestLeak, buildFullFunnel, renderFullFunnelVerdict } from "@/lib/quiz/fullFunnel";
import {
  readTrafficSource,
  renderTrafficForPrompt,
  sanitizeVisitMeta,
} from "@/lib/quiz/trafficSource";

export interface PartnerReadout {
  /** "quiz" : un seul quiz, le verdict a un sens. "account" : plusieurs,
   *  il n'en a aucun et le coach doit demander de choisir. */
  scope: "quiz" | "account";
  quizTitle: string | null;
  /** Le parcours, en clair : arrivées, démarrages, questions, emails. */
  counts: {
    views: number;
    starts: number;
    completes: number;
    leads: number;
    viewsReliable: boolean;
    questionCount: number;
  } | null;
  /** Le verdict du parcours, rédigé par la MÊME fonction que l'écran de
   *  stats. Non négociable côté coach. */
  funnelVerdict: string | null;
  /** Le verdict de provenance, idem. */
  trafficVerdict: string | null;
  /** Ce qu'on a le droit de conclure sur les questions. */
  questionSignal: FunnelSignal | null;
}

const EMPTY_ACCOUNT: PartnerReadout = {
  scope: "account",
  quizTitle: null,
  counts: null,
  funnelVerdict: null,
  trafficVerdict: null,
  questionSignal: null,
};

/** Fenêtre de lecture de la provenance, comme l'écran de stats. */
const TRAFFIC_WINDOW = 1000;

/**
 * Construit la lecture d'UN quiz. `null` en cas de doute : mieux vaut un
 * coach qui dit "je n'ai pas tes chiffres" qu'un coach qui commente ceux
 * d'un autre quiz.
 */
export async function buildPartnerReadout(
  userId: string,
  quizId: string | null,
): Promise<PartnerReadout> {
  if (!quizId) return EMPTY_ACCOUNT;

  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, views_count, starts_count, completions_count")
    .eq("id", quizId)
    .maybeSingle();
  // Le gate user_id n'est pas une precaution de style : sans lui, un
  // jeton de connexion permettrait de lire le quiz de n'importe qui.
  if (!quiz || quiz.user_id !== userId) return EMPTY_ACCOUNT;

  const [leadsRes, viewsEv, startsEv, completesEv, questionsRes] = await Promise.all([
    // Tipote stocke les leads dans `leads` (source = 'quiz'), pas dans
    // une table dediee : meme comptage que l'ecran de stats d'ici.
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "quiz")
      .eq("source_id", quizId),
    supabaseAdmin.from("quiz_events").select("id", { count: "exact", head: true }).eq("quiz_id", quizId).eq("event_type", "view"),
    supabaseAdmin.from("quiz_events").select("id", { count: "exact", head: true }).eq("quiz_id", quizId).eq("event_type", "start"),
    supabaseAdmin.from("quiz_events").select("id", { count: "exact", head: true }).eq("quiz_id", quizId).eq("event_type", "complete"),
    supabaseAdmin.from("quiz_questions").select("id").eq("quiz_id", quizId),
  ]);

  const leads = leadsRes.count ?? 0;
  const trackedViews = Math.max((quiz.views_count as number) ?? 0, viewsEv.error ? 0 : viewsEv.count ?? 0);
  const starts = Math.max((quiz.starts_count as number) ?? 0, startsEv.error ? 0 : startsEv.count ?? 0);
  const completes = Math.max((quiz.completions_count as number) ?? 0, completesEv.error ? 0 : completesEv.count ?? 0);
  const viewsReliable = trackedViews >= leads;
  const views = Math.max(trackedViews, leads);
  const questionCount = (questionsRes.data ?? []).length;

  // Funnel par question, recalé sur les questions VIVANTES.
  let steps: FunnelStepLike[] = [];
  try {
    const { data: rows } = await supabaseAdmin.rpc("quiz_question_funnel_detail", {
      p_quiz_id: quizId,
      p_since: null,
    });
    steps = buildLiveFunnel(
      (rows ?? []) as { question_index: number; views: number; answers: number }[],
      questionCount,
    ).steps;
  } catch {
    // RPC absente sur un vieux deploy : on continue sans le detail.
  }

  const fullFunnel = buildFullFunnel({ views, starts, questions: steps, leads, viewsReliable });

  // Provenance, sur la meme fenetre que l'ecran de stats.
  const trafficRes = await supabaseAdmin
    .from("quiz_events")
    .select("meta")
    .eq("quiz_id", quizId)
    .eq("event_type", "view")
    .not("meta", "is", null)
    .order("created_at", { ascending: false })
    .limit(TRAFFIC_WINDOW);
  const traffic = readTrafficSource(
    (trafficRes.error ? [] : trafficRes.data ?? []).map((r) =>
      sanitizeVisitMeta((r as { meta?: unknown }).meta),
    ),
  );

  return {
    scope: "quiz",
    quizTitle: stripHtml(String(quiz.title ?? "")).trim() || null,
    counts: { views, starts, completes, leads, viewsReliable, questionCount },
    funnelVerdict: renderFullFunnelVerdict(fullFunnel) || null,
    trafficVerdict: renderTrafficForPrompt(traffic),
    questionSignal: readFunnelSignal(steps),
  };
}

/** Le cas "plusieurs quiz", exporté pour que l'appelant soit explicite. */
export function accountReadout(): PartnerReadout {
  return EMPTY_ACCOUNT;
}

/** `biggestLeak` réexporté : l'appelant n'a pas à connaître le module. */
export { biggestLeak };
