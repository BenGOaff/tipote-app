// app/api/tasks/[id]/route.ts
// PATCH (toggle status / update fields), DELETE, GET

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type PatchBody = Partial<{
  status: unknown;
  done: unknown;
  title: unknown;
  description: unknown;
  due_date: unknown;
  importance: unknown;
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

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, description, status, due_date, importance, created_at, updated_at")
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

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;
    const raw = (await req.json()) as PatchBody;

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

    if (raw.description !== undefined) {
      update.description = cleanNullableString(raw.description);
    }

    if (raw.due_date !== undefined) {
      let due = cleanNullableString(raw.due_date);
      if (due && !isIsoDateYYYYMMDD(due)) {
        const d = new Date(due);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ ok: false, error: "Date invalide" }, { status: 400 });
        }
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        due = `${yyyy}-${mm}-${dd}`;
      }
      update.due_date = due;
    }

    if (raw.importance !== undefined) {
      const imp = cleanNullableString(raw.importance);
      update.importance = imp && imp.toLowerCase() === "high" ? "high" : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("id, title, description, status, due_date, importance, created_at, updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;

    const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", auth.user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
