// app/api/custom-domain/[id]/route.ts
// DELETE removes a custom domain.
// PATCH updates per-domain settings (currently: favicon_url).
//
// Both handlers are scoped to (user_id, active project_id) so a user
// can't read/write a row of one of their other projects just by knowing
// its UUID.
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

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "No active project." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { favicon_url?: string | null } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if ("favicon_url" in body) {
    const v = body.favicon_url;
    patch.favicon_url = typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No allowed fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_domains")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, domain: data });
}

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
