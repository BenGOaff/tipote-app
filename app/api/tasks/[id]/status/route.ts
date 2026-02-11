// app/api/tasks/[id]/status/route.ts
// PATCH /api/tasks/:id/status
// Petit wrapper dédié au changement de status (pour l’UI).
// ✅ Auth + sécurité user_id
// ✅ TS strict, pas de any
// ✅ Contrat JSON standard : { ok, task? , error? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

type Ctx = { params: Promise<{ id: string }> };

type Status = "todo" | "in_progress" | "blocked" | "done";

type TaskRow = {
  id: string;
  user_id: string;
  status: Status | string | null;
  updated_at?: string | null;
};

function normalizeStatus(v: unknown): Status | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();

  if (s === "todo") return "todo";
  if (s === "in_progress" || s === "in progress" || s === "progress") return "in_progress";
  if (s === "blocked" || s === "bloqué" || s === "bloque") return "blocked";
  if (s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine") return "done";

  return null;
}

type PatchBody = {
  status?: unknown;
};

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || !("status" in body)) {
      return NextResponse.json({ ok: false, error: "Missing status" }, { status: 400 });
    }

    const st = normalizeStatus(body.status);
    if (!st) {
      return NextResponse.json({ ok: false, error: "Status invalide" }, { status: 400 });
    }

    // ✅ IMPORTANT: update via service_role (RLS-safe), filtré par (id + user_id) => pas de fuite
    let updateQuery = supabaseAdmin
      .from("project_tasks")
      .update({ status: st, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (projectId) updateQuery = updateQuery.eq("project_id", projectId);

    const { data, error } = await updateQuery
      .select("id,user_id,status,updated_at")
      .maybeSingle<TaskRow>();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
