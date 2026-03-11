// app/api/tasks/[id]/subtasks/[subtaskId]/route.ts
// PATCH (toggle/rename) / DELETE a subtask

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Ctx = { params: Promise<{ id: string; subtaskId: string }> };

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

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id: taskId, subtaskId } = await context.params;
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

    const rec = body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if ("title" in rec) {
      const t = typeof rec.title === "string" ? rec.title.trim() : "";
      if (!t) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
      update.title = t.slice(0, 500);
    }
    if ("is_done" in rec && typeof rec.is_done === "boolean") {
      update.is_done = rec.is_done;
    }
    if ("position" in rec && typeof rec.position === "number") {
      update.position = rec.position;
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ ok: false, error: "No fields" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_subtasks")
      .update(update)
      .eq("id", subtaskId)
      .eq("task_id", taskId)
      .select("id, title, is_done, position, created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Subtask not found" }, { status: 404 });

    return NextResponse.json({ ok: true, subtask: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { id: taskId, subtaskId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!(await verifyTaskOwnership(taskId, auth.user.id))) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("task_subtasks")
      .delete()
      .eq("id", subtaskId)
      .eq("task_id", taskId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
