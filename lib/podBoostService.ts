// Logique métier Tipote Boost — appelée par les routes API. Garde les
// règles d'auto-join, throttling et matching ici plutôt que dans chaque
// route, pour pouvoir tester unitairement plus tard.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SEED_POD_FR_SLUG } from "@/lib/podBoost";

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
