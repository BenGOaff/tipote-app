// lib/reengagement/detector.ts
//
// Détection des users à relancer avec un email de VALEUR (pas une
// relance "tu nous manques" générique). Phase 3 ROADMAP_RETENTION.md.
//
// Esprit Béné : "on aide on aide on aide". Pas de chantage, pas de
// countdown, pas d'angoisse. Juste détecter une fenêtre où l'user
// pourrait avoir besoin d'un coup de pouce concret, et lui filer 1
// CTA actionnable.
//
// V1 buckets :
//   - "idle_producer_7d" : aucun business_event d'ACTION (post_published,
//     quiz_published, page_published, popquiz_published) depuis 7 jours
//     ET pas de log récent (last_sign_in_at > 3j → on évite ceux qui
//     consultent leur dashboard quotidiennement même sans rien produire).
//
// V2 buckets prévus (placeholder ici, pas implémentés V1) :
//   - "sleeping_quiz" : quiz publié actif, 0 vue sur 14j → relance sur
//     CE quiz avec un CTA "boost ton quiz"
//   - "strategy_drift" : stratégie générée il y a 90j+, infos profil
//     ont changé → CTA "recalculer ma stratégie"

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PRODUCTION_KINDS = [
  "post_published",
  "quiz_published",
  "page_published",
  "popquiz_published",
] as const;

export type ReengagementBucket = "idle_producer_7d";

export interface DetectInactivityArgs {
  userId: string;
  lastSignInAt: Date | null;
  now?: Date;
}

/**
 * Retourne le bucket applicable pour ce user, ou null s'il n'est pas
 * candidat à un nudge value-driven aujourd'hui.
 *
 * Logique :
 *   1. last_sign_in_at < 3j → user consulte régulièrement → skip
 *      (il sait qu'il n'a pas produit, lui rappeler est inutile et
 *      potentiellement vexant).
 *   2. ≥ 1 business_event "production" dans les 7 derniers jours → skip
 *      (l'user a publié, on ne le titille pas).
 *   3. Sinon → bucket "idle_producer_7d".
 *
 * Lit business_events (créée 2026-06-04). Pour les users qui étaient
 * actifs AVANT cette date mais n'ont rien produit depuis, ils tombent
 * légitimement dans le bucket → on les relance, c'est l'effet voulu.
 */
export async function detectReengagementBucket(
  args: DetectInactivityArgs,
): Promise<ReengagementBucket | null> {
  const now = args.now ?? new Date();

  // Filtre 1 : connexion récente → pas la peine d'envoyer un email
  // si l'user vient de regarder son dashboard ce matin.
  if (args.lastSignInAt) {
    const daysSinceLastSignIn =
      (now.getTime() - args.lastSignInAt.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceLastSignIn < 3) return null;
  }

  // Filtre 2 : production active dans les 7 derniers jours.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { count, error } = await supabaseAdmin
    .from("business_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .in("kind", PRODUCTION_KINDS as unknown as string[])
    .gte("occurred_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error("[reengagement] detector failed", error.message);
    return null;
  }
  if ((count ?? 0) > 0) return null;

  return "idle_producer_7d";
}

/**
 * Récupère le best post / le top quiz du user pour personnaliser le
 * nudge. Si rien à montrer (user qui n'a JAMAIS rien produit), retourne
 * null → on enverra un nudge "première fois" plus accueillant.
 */
export interface UserHighlights {
  topPostTitle: string | null;
  topQuizTitle: string | null;
}

export async function fetchUserHighlights(userId: string): Promise<UserHighlights> {
  // Top post = content_item le plus récent qui ait status='published'.
  // On cherche un titre, pas un engagement metric (Tipote n'a pas de
  // signal engagement universel cross-platform pour V1).
  const { data: post } = await supabaseAdmin
    .from("content_item")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "published")
    .not("title", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Top quiz = quiz publié le plus récent (heuristique simple V1).
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("title", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    topPostTitle: (post?.title as string | null) ?? null,
    topQuizTitle: (quiz?.title as string | null) ?? null,
  };
}
