// app/api/pages/list/route.ts
// Lists all hosted pages for the current user/project.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, session.user.id).catch(() => null);

  let query = supabase
    .from("hosted_pages")
    .select("id, title, slug, page_type, status, template_id, og_image_url, views_count, leads_count, created_at, updated_at")
    .eq("user_id", session.user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pages: data ?? [] });
}
