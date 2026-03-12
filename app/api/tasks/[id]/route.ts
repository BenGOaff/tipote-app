// app/api/tasks/[id]/route.ts
// GET / PATCH / DELETE sur public.project_tasks
// ✅ Auth + sécurité user_id
// ✅ Zéro any, TS strict
// ✅ Contrat JSON standard : { ok, task? , error? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Ctx = { params: Promise<{ id: string }> };

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  estimated_duration: string | null;
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

    // ✅ RLS-safe read (service_role) + filtre user_id + exclure soft-deleted
    // Pas de filtre project_id : id + user_id suffit pour la sécurité
    // et évite les échecs silencieux quand project_id est null.
    const { data, error } = await supabaseAdmin
      .from("project_tasks")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle<TaskRow>();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

    // Enrich with tags + subtask progress
    const [tagsRes, subtasksRes] = await Promise.all([
      supabaseAdmin
        .from("task_tag_assignments")
        .select("tag_id, task_tags(id, name, color)")
        .eq("task_id", id),
      supabaseAdmin
        .from("task_subtasks")
        .select("id, title, is_done, position")
        .eq("task_id", id)
        .order("position", { ascending: true }),
    ]);

    const tags = (tagsRes.data ?? []).map((a: Record<string, unknown>) => a.task_tags).filter(Boolean);
    const subtasks = subtasksRes.data ?? [];
    const subtasksDone = subtasks.filter((s: Record<string, unknown>) => s.is_done).length;

    return NextResponse.json({
      ok: true,
      task: {
        ...data,
        tags,
        subtasks,
        subtasks_total: subtasks.length,
        subtasks_done: subtasksDone,
      },
    }, { status: 200 });
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

    if ("description" in body) {
      const desc = (body as Record<string, unknown>).description;
      update.description = typeof desc === "string" ? desc.slice(0, 5000) : null;
    }

    if ("due_date" in body) {
      update.due_date = normalizeDueDate((body as Record<string, unknown>).due_date);
    }

    if ("estimated_duration" in body) {
      const dur = (body as Record<string, unknown>).estimated_duration;
      update.estimated_duration = typeof dur === "string" ? dur.trim().slice(0, 50) || null : null;
    }

    // Priority
    if ("priority" in body) {
      const rawPriority = cleanString((body as Record<string, unknown>).priority);
      if (rawPriority === null) {
        update.priority = null;
      } else {
        const lp = rawPriority.toLowerCase();
        if (lp === "high" || lp === "medium" || lp === "low") {
          update.priority = lp;
        }
      }
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

    // Tag assignments (separate from the main update)
    const hasTagUpdate = "tag_ids" in body && Array.isArray((body as Record<string, unknown>).tag_ids);

    if (Object.keys(update).length === 0 && !hasTagUpdate) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    let data: TaskRow | null = null;

    if (Object.keys(update).length > 0) {
      const res = await supabaseAdmin
        .from("project_tasks")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle<TaskRow>();

      if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 400 });
      if (!res.data) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
      data = res.data;
    } else {
      // Just tag update — verify task exists
      const check = await supabaseAdmin
        .from("project_tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .is("deleted_at", null)
        .maybeSingle<TaskRow>();
      if (!check.data) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
      data = check.data;
    }

    // Sync tag assignments
    if (hasTagUpdate) {
      const tagIds = ((body as Record<string, unknown>).tag_ids as string[]).filter(
        (tid) => typeof tid === "string" && tid.length > 0,
      );

      // Remove all existing assignments for this task
      await supabaseAdmin
        .from("task_tag_assignments")
        .delete()
        .eq("task_id", id);

      // Insert new ones (only tags owned by this user)
      if (tagIds.length > 0) {
        const { data: validTags } = await supabaseAdmin
          .from("task_tags")
          .select("id")
          .eq("user_id", auth.user.id)
          .in("id", tagIds);

        const validIds = (validTags ?? []).map((t) => t.id);
        if (validIds.length > 0) {
          await supabaseAdmin
            .from("task_tag_assignments")
            .insert(validIds.map((tagId) => ({ task_id: id, tag_id: tagId })));
        }
      }
    }

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

    // ✅ Soft-delete : on marque deleted_at au lieu de supprimer physiquement.
    // Cela empêche le sync de recréer la tâche.
    // Pas de filtre project_id : id + user_id suffit pour la sécurité
    // et évite les échecs silencieux quand project_id est null.
    const { data, error } = await supabaseAdmin
      .from("project_tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Tâche introuvable" }, { status: 404 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
