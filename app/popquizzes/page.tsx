// List page for the caller's popquizzes. Server component qui fait
// la fetch + délègue le rendu à PopquizzesClient (côté client) pour
// l'interactivité (filtres, suppression, popover embed).
//
// Tipote spec : la liste est scopée par projet actif (multi-projet).
// Visuel aligné sur /quizzes pour la cohérence inter-listes.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { isPaidPlan, FREE_LIMITS } from "@/lib/planLimits";
import AppShell from "@/components/AppShell";
import { PopquizzesClient, type PopquizListItem } from "./PopquizzesClient";

export const metadata = { title: "Mes Popquiz – Tipote" };

interface VideoLite {
  source: string;
  thumbnail_url: string | null;
  status: string;
}

function firstVideo(
  v: VideoLite | VideoLite[] | null | undefined,
): VideoLite | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export default async function PopquizzesListPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const projectId = await getActiveProjectId(supabase, user.id);

  // Liste scopée par projet actif (multi-projet Tipote).
  let listQuery = supabase
    .from("popquizzes")
    .select(
      `id, title, slug, is_published, views_count, completions_count,
       video:popquiz_videos!inner(source, thumbnail_url, status)`,
    )
    .eq("user_id", user.id);
  if (projectId) listQuery = listQuery.eq("project_id", projectId);

  // Plan vit dans `profiles` (filter sur `id`, pas `user_id`) et nécessite
  // un admin client pour bypass RLS, comme pour POST /api/popquiz.
  let plan: string | null = "free";
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    plan = (profile as { plan?: string | null } | null)?.plan ?? "free";
  } catch {
    // fail-open
  }

  const { data: rows } = await listQuery.order("created_at", { ascending: false });

  const popquizzes: PopquizListItem[] = (rows ?? []).map((r: any) => {
    const v = firstVideo(r.video);
    return {
      id: String(r.id),
      title: String(r.title ?? ""),
      slug: typeof r.slug === "string" ? r.slug : null,
      is_published: r.is_published === true,
      views_count: Number(r.views_count ?? 0),
      completions_count: Number(r.completions_count ?? 0),
      thumbnail_url: v?.thumbnail_url ?? null,
      source: v?.source ?? "?",
    };
  });

  const isPaid = isPaidPlan(plan);

  return (
    <AppShell userEmail={user.email ?? ""} headerTitle="Mes Popquiz" contentClassName="flex-1 p-4 sm:p-5 lg:p-6">
      <PopquizzesClient
        popquizzes={popquizzes}
        isPaid={isPaid}
        maxFree={FREE_LIMITS.maxPopquizzes}
      />
    </AppShell>
  );
}
