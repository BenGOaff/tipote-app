// app/api/tasks/[id]/subtasks/route.ts
// GET / POST subtasks for a task

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Ctx = { params: Promise<{ id: string }> };

async function verifyTaskOwnership(taskId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("project_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { id: taskId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!(await verifyTaskOwnership(taskId, auth.user.id))) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_subtasks")
      .select("id, title, is_done, position, created_at")
      .eq("task_id", taskId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, subtasks: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { id: taskId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!(await verifyTaskOwnership(taskId, auth.user.id))) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const { title } = body as Record<string, unknown>;
    const trimmed = typeof title === "string" ? title.trim() : "";
    if (!trimmed) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });

    // Get max position
    const { data: last } = await supabaseAdmin
      .from("task_subtasks")
      .select("position")
      .eq("task_id", taskId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPos = (last?.position ?? -1) + 1;

    const { data, error } = await supabaseAdmin
      .from("task_subtasks")
      .insert({
        task_id: taskId,
        title: trimmed.slice(0, 500),
        position: nextPos,
      })
      .select("id, title, is_done, position, created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, subtask: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
