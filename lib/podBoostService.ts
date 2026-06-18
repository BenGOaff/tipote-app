// Logique métier Tipote Boost — appelée par les routes API. Garde les
// règles d'auto-join, throttling et matching ici plutôt que dans chaque
// route, pour pouvoir tester unitairement plus tard.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SEED_POD_FR_SLUG, POST_ELIGIBILITY_HOURS, type CommentTone } from "@/lib/podBoost";
import { generateSuggestions, type CommentSuggestions } from "@/lib/podAiSuggest";

/** Hard cap par défaut sur le nb de pod-mates qui reçoivent une tâche
 *  pour un même post. Limite l'inflation de tâches en attendant un
 *  algo de sélection plus fin (karma + diversité). Phase 4 affinera. */
const DEFAULT_FANOUT_LIMIT = 10;

/** Auto-join du user au pod FR seed quand il connecte son LinkedIn pour
 *  la 1ère fois (et que sa langue détectée est 'fr'). Idempotent : la
 *  contrainte UNIQUE (pod_id, user_id) bloque les doublons. */
export async function autoJoinSeedPod(userId: string, language: string | null) {
  // V1 : seul le pod FR est seedé. Les users en autres langues ne sont
  // joinés à rien automatiquement (pas de pod EN/ES/IT/… seedé pour le
  // moment, c'est une décision produit — on étend quand le volume FR
  // dépasse ~50 membres actifs).
  if (language !== "fr") return { joined: false, reason: "no_seed_pod_for_language" };

  const { data: pod, error: podErr } = await supabaseAdmin
    .from("pods")
    .select("id")
    .eq("slug", SEED_POD_FR_SLUG)
    .maybeSingle();

  if (podErr || !pod) {
    console.error("[podBoost] Seed pod introuvable", { slug: SEED_POD_FR_SLUG, podErr });
    return { joined: false, reason: "seed_pod_missing" };
  }

  const { error: joinErr } = await supabaseAdmin
    .from("pod_memberships")
    .insert({ pod_id: pod.id, user_id: userId, role: "member", status: "active" })
    .select("id")
    .maybeSingle();

  // Conflict 23505 = déjà membre, c'est OK.
  if (joinErr && joinErr.code !== "23505") {
    console.error("[podBoost] auto-join failed", joinErr);
    return { joined: false, reason: "insert_error" };
  }

  // Bump member_count (best-effort, on a aussi un trigger possible plus
  // tard si on veut atomic). Pour v1 on update direct.
  await supabaseAdmin
    .from("pods")
    .update({ member_count: (await getActiveMemberCount(pod.id)) })
    .eq("id", pod.id);

  // Ensure karma row exists pour ce user (créée au 1er join).
  await supabaseAdmin
    .from("pod_karma")
    .insert({ user_id: userId })
    .select("user_id")
    .maybeSingle();

  return { joined: true, podId: pod.id };
}

async function getActiveMemberCount(podId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("pod_memberships")
    .select("id", { count: "exact", head: true })
    .eq("pod_id", podId)
    .eq("status", "active");
  return count ?? 0;
}

// ─── Fan-out : publication détectée → tâches d'engagement ──────────────

export type SignalPostResult =
  | { ok: true; postId: string; tasksCreated: number; alreadyExisted: boolean }
  | { ok: false; reason: "no_linkedin_profile" | "no_active_pod" | "insert_failed" };

/** Signal qu'une publication LinkedIn de l'auteur vient d'être détectée.
 *  Insère pod_posts (idempotent via UNIQUE linkedin_post_urn), puis crée
 *  une tâche pour chaque pod-mate eligible des pods dans lesquels l'auteur
 *  est actif. Retourne le nombre de tâches créées. */
export async function signalPostPublished(params: {
  authorUserId: string;
  linkedinPostUrn: string;
  postUrl: string | null;
  contentExcerpt: string | null;
  language: string | null;
  /** Origine du post : "extension" (détection DOM, historique) ou
   *  "tipote" (publié via /api/social/publish). Les posts "tipote"
   *  déclenchent l'AUTO-like chez les pod-mates opt-in (Béné 12 juin
   *  2026) ; les posts "extension" gardent le like à la validation du
   *  commentaire. */
  source?: "extension" | "tipote";
}): Promise<SignalPostResult> {
  const { authorUserId, linkedinPostUrn, postUrl, contentExcerpt, language } = params;
  const source = params.source ?? "extension";

  // 1. Vérifier que l'auteur a un profil LinkedIn lié (sinon pas de fan-out
  //    possible — il faut d'abord qu'il connecte son extension).
  const { data: profile } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .select("user_id")
    .eq("user_id", authorUserId)
    .maybeSingle();
  if (!profile) return { ok: false, reason: "no_linkedin_profile" };

  // 2. Récupérer les pods actifs de l'auteur. Si aucun → pas de fan-out
  //    mais on enregistre quand même le post (utile pour stats + édition
  //    rétroactive si l'auteur join un pod plus tard).
  const { data: memberships } = await supabaseAdmin
    .from("pod_memberships")
    .select("pod_id")
    .eq("user_id", authorUserId)
    .eq("status", "active");
  const podIds = (memberships ?? []).map((m) => m.pod_id as string);

  // 3. Upsert idempotent du post (ON CONFLICT linkedin_post_urn DO NOTHING).
  //    Si le post existait déjà, on récupère son id mais on ne refait pas
  //    le fan-out — un même post = une fan-out (Meta retry, double DOM event,
  //    etc. sont neutralisés).
  const eligibleUntil = new Date(Date.now() + POST_ELIGIBILITY_HOURS * 3600_000).toISOString();
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("pod_posts")
    .insert({
      author_user_id: authorUserId,
      linkedin_post_urn: linkedinPostUrn,
      post_url: postUrl,
      content_excerpt: contentExcerpt?.slice(0, 500) ?? null,
      language,
      eligible_until: eligibleUntil,
      source,
    })
    .select("id")
    .maybeSingle();

  let postId: string;
  let alreadyExisted = false;
  if (insertErr && insertErr.code === "23505") {
    // Doublon : on retrouve la row existante pour retourner son id.
    const { data: existing } = await supabaseAdmin
      .from("pod_posts")
      .select("id")
      .eq("linkedin_post_urn", linkedinPostUrn)
      .maybeSingle();
    if (!existing) return { ok: false, reason: "insert_failed" };
    postId = existing.id as string;
    alreadyExisted = true;
  } else if (insertErr || !inserted) {
    console.error("[podBoost] pod_posts insert failed", insertErr);
    return { ok: false, reason: "insert_failed" };
  } else {
    postId = inserted.id as string;
  }

  // 4. Si déjà fait OU pas de pod actif, on s'arrête là — pas de fan-out.
  if (alreadyExisted || podIds.length === 0) {
    return {
      ok: true,
      postId,
      tasksCreated: 0,
      alreadyExisted: alreadyExisted || podIds.length === 0,
    };
  }

  // 5. Génération IA des 4 suggestions de commentaires UNE FOIS pour
  //    ce post. Mutualisée entre tous les pod-mates pour éviter N appels
  //    Claude. Si la génération échoue, on a un fallback statique côté
  //    podAiSuggest — donc on n'a jamais zéro suggestion sur une task.
  const suggestions = await generateSuggestions({
    contentExcerpt: contentExcerpt?.slice(0, 1500) ?? null,
    language: language ?? "fr",
  });

  // 6. Fan-out par pod, on passe les suggestions à chaque task.
  let tasksCreated = 0;
  for (const podId of podIds) {
    tasksCreated += await fanOutForPod({
      podPostId: postId,
      podId,
      authorUserId,
      postLanguage: language,
      suggestions,
      source,
    });
  }

  return { ok: true, postId, tasksCreated, alreadyExisted: false };
}

/** Sélectionne les pod-mates eligibles d'un pod et crée leurs tâches.
 *  Règles v1 (Phase 4 affinera) :
 *    - membres actifs du pod
 *    - exclus : l'auteur, et tous ceux sans pod_linkedin_profiles
 *    - filtre langue : si post.language ET member.language_detected définis,
 *      doivent matcher (sinon on inclut — fallback permissif)
 *    - cap à DEFAULT_FANOUT_LIMIT par pod
 *    - ordre aléatoire pour éviter le biais "toujours les mêmes engagés". */
async function fanOutForPod(params: {
  podPostId: string;
  podId: string;
  authorUserId: string;
  postLanguage: string | null;
  // Partial : generateSuggestions peut ne renvoyer qu'un sous-ensemble de
  // tons. Au fan-out on demande les 4 (pas de `tones`), donc en pratique
  // c'est complet, mais le type reste honnête.
  suggestions: Partial<CommentSuggestions>;
  source: "extension" | "tipote";
}): Promise<number> {
  const { podPostId, podId, authorUserId, postLanguage, suggestions, source } = params;

  // Jointure : memberships actives du pod + profil LinkedIn de chacun.
  // Foreign-key implicite : pod_memberships.user_id → pod_linkedin_profiles.user_id.
  const { data: candidates } = await supabaseAdmin
    .from("pod_memberships")
    .select("user_id, pod_linkedin_profiles!inner(user_id, language_detected, auto_like_enabled)")
    .eq("pod_id", podId)
    .eq("status", "active")
    .neq("user_id", authorUserId);

  if (!candidates?.length) return 0;

  // Filtre langue. Supabase typegen renvoie pod_linkedin_profiles comme
  // un array (FK 1-N a priori) — en pratique 1-1 via user_id PK donc
  // on prend la 1ère row.
  type CandidateProfile = {
    language_detected: string | null;
    auto_like_enabled?: boolean | null;
  };
  type Candidate = {
    user_id: string;
    pod_linkedin_profiles: CandidateProfile[] | CandidateProfile | null;
  };
  const matched = (candidates as unknown as Candidate[]).filter((c) => {
    if (!postLanguage) return true;
    const profile = Array.isArray(c.pod_linkedin_profiles)
      ? c.pod_linkedin_profiles[0]
      : c.pod_linkedin_profiles;
    const memberLang = profile?.language_detected;
    if (!memberLang) return true; // fallback permissif si langue membre inconnue
    return memberLang === postLanguage;
  });

  // Mélange + cap.
  const shuffled = matched
    .map((c) => ({ c, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.c)
    .slice(0, DEFAULT_FANOUT_LIMIT);

  if (!shuffled.length) return 0;

  // Insert tasks en batch. ON CONFLICT (pod_post_id, assigned_user_id) DO
  // NOTHING n'existe pas en standard sans contrainte unique — on accepte
  // les doublons éventuels (notre fan-out est déjà gated par alreadyExisted,
  // donc on n'y arrivera pas en pratique).
  const rows = shuffled.map((c) => {
    const profile = Array.isArray(c.pod_linkedin_profiles)
      ? c.pod_linkedin_profiles[0]
      : c.pod_linkedin_profiles;
    return {
      pod_post_id: podPostId,
      pod_id: podId,
      assigned_user_id: c.user_id,
      status: "pending" as const,
      ai_comment_suggestions: suggestions,
      // Auto-like figé au fan-out : post publié via Tipote ET membre
      // opt-in à ce moment-là. Le commentaire reste validé en 1 clic.
      auto_like: source === "tipote" && profile?.auto_like_enabled !== false,
    };
  });
  const { error, count } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .insert(rows, { count: "exact" });
  if (error) {
    console.error("[podBoost] task insert failed", { podId, error });
    return 0;
  }
  return count ?? rows.length;
}

// ─── Lifecycle des tâches ──────────────────────────────────────────────

/** Marque une tâche comme "liked" (l'extension confirme le like Voyager OK).
 *  Vérifie que c'est bien l'engageur qui appelle. */
export async function markTaskLiked(taskId: string, callerUserId: string) {
  const { data: task } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .select("id, assigned_user_id, status")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, reason: "not_found" as const };
  if (task.assigned_user_id !== callerUserId) return { ok: false, reason: "forbidden" as const };
  if (task.status !== "pending") return { ok: false, reason: "wrong_status" as const };

  const { error } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .update({ status: "liked", liked_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, reason: "update_failed" as const };
  return { ok: true as const };
}

/** Marque une tâche comme "commented" + enregistre le ton choisi et le
 *  texte final posté. Bumpe le karma (donné côté engager, reçu côté auteur)
 *  parce que le commentaire est l'action coûteuse du couple like+comment. */
export async function markTaskCommented(params: {
  taskId: string;
  callerUserId: string;
  selectedTone: CommentTone;
  postedCommentText: string;
}) {
  const { taskId, callerUserId, selectedTone, postedCommentText } = params;
  const { data: task } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .select("id, assigned_user_id, status, pod_post_id, pod_posts!inner(author_user_id)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, reason: "not_found" as const };
  if (task.assigned_user_id !== callerUserId) return { ok: false, reason: "forbidden" as const };
  if (task.status !== "liked" && task.status !== "pending") {
    return { ok: false, reason: "wrong_status" as const };
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .update({
      status: "commented",
      selected_tone: selectedTone,
      posted_comment_text: postedCommentText,
      commented_at: now,
      // Le like a peut-être pas été tracké côté API (ex: l'extension a fait
      // like+comment en une passe). On fait un default si liked_at null.
      ...(task.status === "pending" ? { liked_at: now } : {}),
    })
    .eq("id", taskId);
  if (error) return { ok: false, reason: "update_failed" as const };

  // Bump karma — best-effort, on ne fail pas la requête sur erreur ici.
  const authorUserId = (task as unknown as { pod_posts: { author_user_id: string } }).pod_posts.author_user_id;
  await bumpKarma(callerUserId, authorUserId);

  return { ok: true as const };
}

/** Marque une tâche "declined" (engager dit "pas pertinent pour moi").
 *  Pas de bump karma — c'est un signal négatif faible, on l'ignorera dans
 *  la sélection future (Phase 4). */
export async function markTaskDeclined(taskId: string, callerUserId: string, reason: string | null) {
  const { data: task } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .select("id, assigned_user_id, status")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, reason: "not_found" as const };
  if (task.assigned_user_id !== callerUserId) return { ok: false, reason: "forbidden" as const };
  if (task.status !== "pending" && task.status !== "liked") {
    return { ok: false, reason: "wrong_status" as const };
  }

  const { error } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .update({
      status: "declined",
      failure_reason: reason?.slice(0, 200) ?? null,
    })
    .eq("id", taskId);
  if (error) return { ok: false, reason: "update_failed" as const };
  return { ok: true as const };
}

/** Bump karma atomique : +1 boosts_given pour l'engager, +1 reçu pour
 *  l'auteur. Idempotent OFF (chaque appel = un bump) — c'est de la
 *  responsabilité du caller de ne l'appeler qu'une fois par tâche. */
async function bumpKarma(engagerUserId: string, authorUserId: string) {
  // RPC SQL atomique serait plus propre — pour v1 on fait 2 update naïfs
  // et on accepte les races (très improbables vu le volume).
  await Promise.all([
    supabaseAdmin.rpc("pod_bump_karma_given", { p_user_id: engagerUserId }).then(
      () => undefined,
      // Si le RPC n'existe pas (pas encore migré), fallback : insert/update naïf.
      async () => {
        const { data: existing } = await supabaseAdmin
          .from("pod_karma")
          .select("boosts_given, current_week_given")
          .eq("user_id", engagerUserId)
          .maybeSingle();
        const given = (existing?.boosts_given ?? 0) + 1;
        const weekGiven = (existing?.current_week_given ?? 0) + 1;
        await supabaseAdmin
          .from("pod_karma")
          .upsert({ user_id: engagerUserId, boosts_given: given, current_week_given: weekGiven, updated_at: new Date().toISOString() });
      },
    ),
    supabaseAdmin.rpc("pod_bump_karma_received", { p_user_id: authorUserId }).then(
      () => undefined,
      async () => {
        const { data: existing } = await supabaseAdmin
          .from("pod_karma")
          .select("boosts_received, current_week_received")
          .eq("user_id", authorUserId)
          .maybeSingle();
        const received = (existing?.boosts_received ?? 0) + 1;
        const weekReceived = (existing?.current_week_received ?? 0) + 1;
        await supabaseAdmin
          .from("pod_karma")
          .upsert({ user_id: authorUserId, boosts_received: received, current_week_received: weekReceived, updated_at: new Date().toISOString() });
      },
    ),
  ]);
}
