// POST /api/client-processes/[processId]/items — add a new item to a process

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ processId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { processId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Verify ownership through client
  const { data: process } = await supabase
    .from("client_processes")
    .select("id, client_id, clients!inner(user_id)")
    .eq("id", processId)
    .single();

  if (!process || (process as any).clients?.user_id !== user.id) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  // Get max position
  const { data: lastItem } = await supabase
    .from("client_process_items")
    .select("position")
    .eq("process_id", processId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = ((lastItem as any)?.position ?? -1) + 1;

  const { data: item, error } = await supabase
    .from("client_process_items")
    .insert({
      process_id: processId,
      title: body.title.trim(),
      position: nextPosition,
      due_date: body.due_date ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item });
}
