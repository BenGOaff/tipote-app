// DELETE /api/client-processes/[processId]/payments/[paymentId]

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ processId: string; paymentId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { processId, paymentId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: proc } = await supabase
    .from("client_processes")
    .select("id, client_id, clients!inner(user_id)")
    .eq("id", processId)
    .single();

  if (!proc || (proc as any).clients?.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("client_payments")
    .delete()
    .eq("id", paymentId)
    .eq("process_id", processId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate amount_collected
  const { data: remaining } = await supabase
    .from("client_payments")
    .select("amount")
    .eq("process_id", processId);

  const totalCollected = (remaining ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  await supabase
    .from("client_processes")
    .update({ amount_collected: totalCollected })
    .eq("id", processId);

  return NextResponse.json({ ok: true, amount_collected: totalCollected });
}
