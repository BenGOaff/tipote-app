// app/api/custom-domain/[id]/route.ts
// Remove a custom domain. RLS guarantees the row belongs to the caller,
// so this is just a thin delete-by-id with a 404 if nothing matched.
//
// After delete, Caddy's /ask endpoint will start returning 404 for the
// hostname, so any cached cert eventually expires and the hostname
// stops serving — no extra cleanup needed on our side.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Project gate — custom domains are per-profile, so a row belongs
  // to a specific (user, project) pair. A user must NOT be able to
  // delete a row owned by another one of their own projects just by
  // knowing its UUID; the active project narrows the scope.
  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "No active project." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_domains")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
