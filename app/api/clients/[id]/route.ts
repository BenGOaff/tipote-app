// GET    /api/clients/[id] — get client with processes + progress
// PATCH  /api/clients/[id] — update client fields
// DELETE /api/clients/[id] — delete client

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Fetch processes with item counts
  const { data: processes } = await supabase
    .from("client_processes")
    .select("*, client_process_items(*)")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const processesWithProgress = (processes ?? []).map((p: any) => {
    const items = p.client_process_items ?? [];
    const total = items.length;
    const done = items.filter((i: any) => i.is_done).length;
    return {
      ...p,
      items,
      total,
      done,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  return NextResponse.json({
    ok: true,
    client,
    processes: processesWithProgress,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.email !== undefined) updates.email = body.email?.trim() || null;
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, client: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
