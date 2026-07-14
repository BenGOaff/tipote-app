// app/api/systeme-io/tags/route.ts
// Fetch existing tags from the user's Systeme.io account

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { resolveSioApiKey } from "@/lib/sio/resolveApiKey";

export const dynamic = "force-dynamic";

const SIO_BASE = "https://api.systeme.io/api";

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let projectId = await getActiveProjectId(supabase, user.id);

    // Si un quizId est fourni, on resout la cle SIO depuis le PROJET DU QUIZ
    // (et non le projet actif du cookie), pour que les tags affiches soient
    // ceux de la cle que le quiz utilise vraiment. Retour Christelle
    // (12 juillet 2026) : les tags de son sous-compte SIO n'apparaissaient
    // pas quand le cookie pointait un autre projet que celui du quiz.
    const quizId = new URL(req.url).searchParams.get("quizId");
    if (quizId) {
      const { data: quizRow } = await supabase
        .from("quizzes")
        .select("project_id")
        .eq("id", quizId)
        .eq("user_id", user.id)
        .maybeSingle();
      const qProject = (quizRow as { project_id?: string | null } | null)?.project_id;
      if (qProject) projectId = String(qProject);
    }

    const apiKey = (await resolveSioApiKey(supabase, user.id, projectId)) ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "NO_API_KEY", tags: [] },
        { status: 400 },
      );
    }

    // Fetch all tags (paginate if needed)
    const allTags: { id: number; name: string }[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const res = await fetch(
        `${SIO_BASE}/tags?limit=100&page=${page}`,
        {
          headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
          },
        },
      );

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json(
            { ok: false, error: "INVALID_API_KEY", tags: [] },
            { status: 400 },
          );
        }
        break;
      }

      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];

      for (const t of items) {
        if (t?.id && t?.name) {
          allTags.push({ id: Number(t.id), name: String(t.name) });
        }
      }

      // Check if there are more pages
      if (items.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return NextResponse.json({ ok: true, tags: allTags });
  } catch (e) {
    console.error("[GET /api/systeme-io/tags] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error", tags: [] },
      { status: 500 },
    );
  }
}
