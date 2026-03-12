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

  // Fetch process summaries for all clients in one query
  const clientIds = (data ?? []).map((c: any) => c.id);
  const processSummaries: Record<string, Array<{ template_id: string | null; name: string; progress: number }>> = {};

  if (clientIds.length > 0) {
    const { data: processes } = await supabase
      .from("client_processes")
      .select("id, client_id, template_id, name, status, client_process_items(is_done)")
      .in("client_id", clientIds);

    for (const p of processes ?? []) {
      const items = (p as any).client_process_items ?? [];
      const total = items.length;
      const done = items.filter((i: any) => i.is_done).length;
      const summary = {
        template_id: p.template_id,
        name: p.name,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
      if (!processSummaries[p.client_id]) processSummaries[p.client_id] = [];
      processSummaries[p.client_id].push(summary);
    }
  }

  const clientsWithSummaries = (data ?? []).map((c: any) => ({
    ...c,
    process_summaries: processSummaries[c.id] ?? [],
  }));

  return NextResponse.json({ ok: true, clients: clientsWithSummaries });
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
