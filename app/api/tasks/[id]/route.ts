// app/api/tasks/[id]/route.ts
// PATCH (toggle status / update fields), DELETE
// (sans `any` pour ESLint)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type PatchBody = Partial<{
  status: string;
  done: boolean;
  title: string;
  description: string | null;
  due_date: string | null;
  importance: string | null;
}>;

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    const patch: Record<string, unknown> = {};
    if (typeof body.done === "boolean") patch.status = body.done ? "done" : "todo";
    if (typeof body.status === "string") patch.status = body.status.trim().slice(0, 30);
    if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
    if (typeof body.description === "string" || body.description === null) {
      patch.description = body.description;
    }
    if (typeof body.due_date === "string" || body.due_date === null) {
      patch.due_date = body.due_date;
    }
    if (typeof body.importance === "string" || body.importance === null) {
      patch.importance = body.importance;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

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
