// app/api/tasks/[id]/route.ts
// GET / PATCH / DELETE sur public.project_tasks
// NOTE: signature Next.js stricte pour éviter l'erreur TypeScript au build.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type PatchBody = Partial<{
  status: unknown;
  done: unknown;
  title: unknown;
  due_date: unknown;
  priority: unknown;
  importance: unknown; // compat ancienne UI
}>;

function cleanString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = cleanString(v);
  return s ? s : null;
}

function isIsoDateYYYYMMDD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeDueDate(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;
  if (isIsoDateYYYYMMDD(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePriority(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  return low === "high" ? "high" : null;
}

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = context.params.id;

    const { data, error } = await supabase
      .from("project_tasks")
      .select("id, title, status, priority, due_date, source, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = context.params.id;
    const raw = (await request.json()) as PatchBody;

    const update: Record<string, string | null> = {};

    if (raw.done !== undefined) {
      const done = Boolean(raw.done);
      update.status = done ? "done" : "todo";
    }

    if (raw.status !== undefined) {
      const st = cleanString(raw.status);
      if (st) update.status = st;
    }

    if (raw.title !== undefined) {
      const t = cleanString(raw.title);
      if (!t) return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
      update.title = t;
    }

    if (raw.due_date !== undefined) {
      // on accepte null pour effacer
      update.due_date = normalizeDueDate(raw.due_date);
    }

    if (raw.priority !== undefined || raw.importance !== undefined) {
      update.priority = normalizePriority(raw.priority ?? raw.importance);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_tasks")
      .update(update)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("id, title, status, priority, due_date, source, created_at, updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = context.params.id;

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
