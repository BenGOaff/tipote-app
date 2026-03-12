// GET  /api/client-processes/[processId]/payments — list payments
// POST /api/client-processes/[processId]/payments — add a payment

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ processId: string }> };

async function verifyOwnership(supabase: any, processId: string, userId: string) {
  const { data: proc } = await supabase
    .from("client_processes")
    .select("id, client_id, clients!inner(user_id)")
    .eq("id", processId)
    .single();

  if (!proc || (proc as any).clients?.user_id !== userId) return null;
  return proc;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { processId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proc = await verifyOwnership(supabase, processId, user.id);
  if (!proc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("client_payments")
    .select("*")
    .eq("process_id", processId)
    .order("paid_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, payments: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { processId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proc = await verifyOwnership(supabase, processId, user.id);
  if (!proc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.amount || isNaN(parseFloat(body.amount))) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  const amount = parseFloat(body.amount);
  const paid_at = body.paid_at || new Date().toISOString().slice(0, 10);
  const note = body.note?.trim() || null;

  // Insert payment
  const { data: payment, error: payErr } = await supabase
    .from("client_payments")
    .insert({ process_id: processId, amount, paid_at, note })
    .select()
    .single();

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  // Update amount_collected on the process (sum of all payments)
  const { data: allPayments } = await supabase
    .from("client_payments")
    .select("amount")
    .eq("process_id", processId);

  const totalCollected = (allPayments ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  await supabase
    .from("client_processes")
    .update({ amount_collected: totalCollected })
    .eq("id", processId);

  return NextResponse.json({ ok: true, payment, amount_collected: totalCollected });
}
