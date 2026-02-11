// app/api/tasks/[id]/route.ts
// GET / PATCH / DELETE sur public.project_tasks
// ✅ Auth + sécurité user_id
// ✅ Zéro any, TS strict
// ✅ Contrat JSON standard : { ok, task? , error? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

type Ctx = { params: Promise<{ id: string }> };

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  source: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDueDate(value: unknown): string | null {
  if (value === null) return null;
  const s = cleanString(value);
  if (!s) return null;

  // On accepte ISO, YYYY-MM-DD, etc. (Supabase cast si colonne date)
  return s;
}

function normalizeStatus(value: unknown): string | null {
  const s = cleanString(value);
  if (!s) return null;

  const low = s.toLowerCase();
  if (low === "todo" || low === "done") return low;

  // Compat tolérante (anciennes valeurs)
  if (low === "completed" || low === "fait" || low === "terminé" || low === "termine") return "done";

  return null;
}

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    // ✅ RLS-safe read (service_role) + filtre user_id
    let query = supabaseAdmin
      .from("project_tasks")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query.maybeSingle<TaskRow>();

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

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const update: Partial<TaskRow> = {};

    if ("title" in body) {
      const title = cleanString((body as Record<string, unknown>).title);
      if (!title) return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
      update.title = title;
    }

    if ("due_date" in body) {
      update.due_date = normalizeDueDate((body as Record<string, unknown>).due_date);
    }

    // Status (tolérant)
    if ("status" in body) {
      const st = normalizeStatus((body as Record<string, unknown>).status);
      if (!st) return NextResponse.json({ ok: false, error: "Status invalide" }, { status: 400 });
      update.status = st;
    }

    // Compat ancienne UI : done booleans → status done/todo
    if ("done" in body) {
      const doneVal = (body as Record<string, unknown>).done;
      if (typeof doneVal === "boolean") update.status = doneVal ? "done" : "todo";
      if (typeof doneVal === "string") {
        const low = doneVal.trim().toLowerCase();
        if (low === "true") update.status = "done";
        if (low === "false") update.status = "todo";
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    // ✅ RLS-safe write + filtre user_id
    let updateQuery = supabaseAdmin
      .from("project_tasks")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (projectId) updateQuery = updateQuery.eq("project_id", projectId);

    const { data, error } = await updateQuery
      .select("*")
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

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    // ✅ RLS-safe delete + filtre user_id
    let deleteQuery = supabaseAdmin
      .from("project_tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (projectId) deleteQuery = deleteQuery.eq("project_id", projectId);

    const { error } = await deleteQuery;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
