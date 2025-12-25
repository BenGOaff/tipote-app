// app/api/tasks/[id]/route.ts
// GET / PATCH / DELETE sur public.project_tasks
// ✅ Next.js 15/16: context.params est typé Promise<{ id: string }>
// ✅ Auth + sécurité user_id
// ✅ Zéro any, zéro as, TS strict
// ✅ Contrat JSON standard : { ok, task? , error? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ id: string }> };

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  created_at?: string;
  updated_at?: string;
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

    const { data, error } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

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
      const title = cleanString(body.title);
      if (!title) return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
      update.title = title;
    }

    if ("due_date" in body) {
      update.due_date = normalizeDueDate(body.due_date);
    }

    // Status (tolérant)
    if ("status" in body) {
      const st = normalizeStatus(body.status);
      if (!st) return NextResponse.json({ ok: false, error: "Status invalide" }, { status: 400 });
      update.status = st;
    }

    // Compat ancienne UI : done / completed booleans → status done/todo
    if ("done" in body) {
      if (typeof body.done === "boolean") update.status = body.done ? "done" : "todo";
      if (typeof body.done === "string") {
        const low = body.done.trim().toLowerCase();
        if (low === "true") update.status = "done";
        if (low === "false") update.status = "todo";
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_tasks")
      .update(update)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("*")
      .maybeSingle();

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

    const { error } = await supabase.from("project_tasks").delete().eq("id", id).eq("user_id", auth.user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
