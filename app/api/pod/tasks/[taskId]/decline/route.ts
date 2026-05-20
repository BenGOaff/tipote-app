// POST /api/pod/tasks/[taskId]/decline
// User a cliqué "pas pertinent pour moi" dans l'extension. Transition
// d'état → declined. Pas de bump karma (négatif faible, signal pour la
// future sélection Phase 4 : "ce membre rejette beaucoup → l'éviter").

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { markTaskDeclined } from "@/lib/podBoostService";

export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body optionnel — on accepte aussi un POST sans body
  }

  const { taskId } = await ctx.params;
  const result = await markTaskDeclined(taskId, user.id, body.reason?.trim() ?? null);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404
      : result.reason === "forbidden" ? 403
      : result.reason === "wrong_status" ? 409
      : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
