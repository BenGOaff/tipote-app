// POST /api/pod/tasks/[taskId]/comment
// L'extension confirme avoir posté le commentaire (avec le ton choisi
// par l'user en 1-click + texte final). Transition d'état → commented.
// Bumpe le karma (donné côté engageur, reçu côté auteur du post).

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { markTaskCommented } from "@/lib/podBoostService";
import { COMMENT_TONES, type CommentTone } from "@/lib/podBoost";

export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { selected_tone?: string; posted_comment_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const tone = body.selected_tone as CommentTone | undefined;
  if (!tone || !(COMMENT_TONES as readonly string[]).includes(tone)) {
    return NextResponse.json({ ok: false, error: "invalid_tone" }, { status: 400 });
  }
  const text = (body.posted_comment_text ?? "").trim();
  if (!text || text.length > 3000) {
    return NextResponse.json({ ok: false, error: "invalid_comment_text" }, { status: 400 });
  }

  const { taskId } = await ctx.params;
  const result = await markTaskCommented({
    taskId,
    callerUserId: user.id,
    selectedTone: tone,
    postedCommentText: text,
  });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404
      : result.reason === "forbidden" ? 403
      : result.reason === "wrong_status" ? 409
      : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
