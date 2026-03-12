// PATCH  /api/client-processes/[processId]/items/[itemId] — toggle is_done or update
// DELETE /api/client-processes/[processId]/items/[itemId] — remove item

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ processId: string; itemId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { processId, itemId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.is_done !== undefined) updates.is_done = !!body.is_done;
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.due_date !== undefined) updates.due_date = body.due_date || null;

  const { data, error } = await supabase
    .from("client_process_items")
    .update(updates)
    .eq("id", itemId)
    .eq("process_id", processId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { processId, itemId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("client_process_items")
    .delete()
    .eq("id", itemId)
    .eq("process_id", processId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
