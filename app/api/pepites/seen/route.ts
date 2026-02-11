// app/api/pepites/seen/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  const body = await req.json().catch(() => ({}));
  const userPepiteId = String(body?.userPepiteId ?? "").trim();

  if (!userPepiteId) {
    return NextResponse.json({ ok: false, error: "missing_userPepiteId" }, { status: 400 });
  }

  let query = supabase
    .from("user_pepites")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", userPepiteId)
    .eq("user_id", user.id);
  if (projectId) query = query.eq("project_id", projectId);

  const { error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
