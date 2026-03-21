// PATCH /api/client-processes/[processId] — update process fields (payment, status, due_date)
// DELETE /api/client-processes/[processId] — remove a process from a client

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ processId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { processId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Verify ownership via client
  const { data: proc } = await supabase
    .from("client_processes")
    .select("id, client_id, clients!inner(user_id)")
    .eq("id", processId)
    .single();

  if (!proc || (proc as any).clients?.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.status !== undefined) updates.status = body.status;
  if (body.due_date !== undefined) updates.due_date = body.due_date || null;
  if (body.amount_total !== undefined) updates.amount_total = body.amount_total;
  if (body.amount_collected !== undefined) updates.amount_collected = body.amount_collected;
  if (body.payment_type !== undefined) updates.payment_type = body.payment_type;
  if (body.installments_count !== undefined) updates.installments_count = body.installments_count;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_processes")
    .update(updates)
    .eq("id", processId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, process: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { processId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership via client
  const { data: proc } = await supabase
    .from("client_processes")
    .select("id, client_id, clients!inner(user_id)")
    .eq("id", processId)
    .single();

  if (!proc || (proc as any).clients?.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete cascades to client_process_items and client_payments via FK constraints
  const { error } = await supabase
    .from("client_processes")
    .delete()
    .eq("id", processId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
