// POST /api/pod/tasks/[taskId]/like
// L'extension confirme avoir liké le post via Voyager. Transition d'état
// pending → liked. Pas de bump karma à cette étape — c'est le
// commentaire qui pèse, le like seul ne suffit pas (Phase 4 affinera si
// on veut compter aussi les likes solo).

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { markTaskLiked } from "@/lib/podBoostService";

export async function POST(_req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { taskId } = await ctx.params;
  const result = await markTaskLiked(taskId, user.id);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404
      : result.reason === "forbidden" ? 403
      : result.reason === "wrong_status" ? 409
      : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
