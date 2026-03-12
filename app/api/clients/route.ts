// GET  /api/clients — list all clients for current user (+ project)
// POST /api/clients — create a new client

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = await getActiveProjectId(supabase, user.id);

  let query = supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, clients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,
      project_id: projectId ?? null,
      lead_id: body.lead_id ?? null,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      status: body.status || "active",
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, client: data });
}
