// app/api/tasks/reorder/route.ts
// PATCH: persist task order after drag & drop
// Body: { orderedIds: string[] } — array of task IDs in desired order

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const orderedIds = body.orderedIds;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "orderedIds array required" },
        { status: 400 },
      );
    }

    // Validate all IDs are strings
    const ids = orderedIds.filter((id): id is string => typeof id === "string");
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid IDs provided" },
        { status: 400 },
      );
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    // Update positions in batch — each task gets its index as position
    const updates = ids.map((id, index) => ({
      id,
      position: index,
    }));

    // Use a single batch update via multiple small updates
    // (Supabase doesn't support bulk positional updates natively)
    let updated = 0;
    for (const { id, position } of updates) {
      let query = supabaseAdmin
        .from("project_tasks")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", auth.user.id);

      if (projectId) query = query.eq("project_id", projectId);

      const { error } = await query;
      if (!error) updated++;
    }

    return NextResponse.json({ ok: true, updated }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
