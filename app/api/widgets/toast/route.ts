// POST /api/widgets/toast — Create a new toast widget
// GET  /api/widgets/toast — List user's toast widgets

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const projectId = await getActiveProjectId(supabase, session.user.id);

  let query = supabase
    .from("toast_widgets")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, widgets: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const projectId = await getActiveProjectId(supabase, session.user.id);
  const body = await req.json().catch(() => ({}));

  const { data, error } = await supabase
    .from("toast_widgets")
    .insert({
      user_id: session.user.id,
      project_id: projectId || null,
      name: body.name || "Mon widget",
      position: body.position || "bottom-left",
      custom_messages: body.custom_messages || [],
      style: body.style || { theme: "light", accent: "#2563eb", rounded: true },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, widget: data });
}
