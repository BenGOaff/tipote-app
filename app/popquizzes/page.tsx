// List page for the caller's popquizzes. Mirrors /quizzes but with
// the popquiz-specific shape (one video per row).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mes Popquiz – Tipote" };

interface VideoLite {
  source: string;
  thumbnail_url: string | null;
  status: string;
}

interface PopquizListRow {
  id: string;
  title: string;
  is_published: boolean;
  views_count: number | null;
  completions_count: number | null;
  video: VideoLite | VideoLite[] | null;
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
  if (!user) redirect("/login");

  const projectId = await getActiveProjectId(supabase, user.id);
  let listQuery = supabase
    .from("popquizzes")
    .select(
      `id, title, is_published, views_count, completions_count,
       video:popquiz_videos!inner(source, thumbnail_url, status)`,
    )
    .eq("user_id", user.id);
  if (projectId) listQuery = listQuery.eq("project_id", projectId);
  const { data } = await listQuery.order("created_at", { ascending: false });

  const popquizzes = (data ?? []) as unknown as PopquizListRow[];

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mes Popquiz</h1>
          <p className="text-sm text-muted-foreground">
            Quiz qui se déclenchent dans une vidéo.
          </p>
        </div>
        <Button asChild>
          <Link href="/popquiz/new">Nouveau Popquiz</Link>
        </Button>
      </header>

      {popquizzes.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center space-y-3">
          <p className="text-muted-foreground">Aucun popquiz pour l'instant.</p>
          <Button asChild>
            <Link href="/popquiz/new">Créer le premier</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {popquizzes.map((p) => {
            const v = firstVideo(p.video);
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="size-12 rounded bg-muted flex items-center justify-center text-[10px] uppercase text-muted-foreground shrink-0">
                  {v?.source ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.is_published ? "Publié" : "Brouillon"}
                    {" · "}
                    {p.views_count ?? 0} vues ·{" "}
                    {p.completions_count ?? 0} terminés
                  </p>
                </div>
                {p.is_published ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/pq/${p.id}`} target="_blank">
                      Voir
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
