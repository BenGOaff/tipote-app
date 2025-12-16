// app/api/tasks/route.ts
// GET: liste des tâches (table tasks)
// POST: création d'une tâche

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type CreateBody = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  importance?: string | null; // "high" | null
  status?: string | null; // "todo" | "done" | ...
};

function cleanString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function cleanNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = cleanString(v);
  return s.length ? s : null;
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, description, status, due_date, importance, created_at, updated_at")
      .eq("user_id", auth.user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, tasks: data ?? [] }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateBody;

    const title = cleanString(body.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
    }

    const description = cleanNullableString(body.description);
    const due_date = cleanNullableString(body.due_date);
    const importanceRaw = cleanNullableString(body.importance);
    const importance = importanceRaw ? importanceRaw.toLowerCase().slice(0, 20) : null;

    const statusRaw = cleanNullableString(body.status);
    const status = statusRaw ? statusRaw.toLowerCase().slice(0, 30) : "todo";

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: auth.user.id,
        title: title.slice(0, 200),
        description,
        due_date,
        importance,
        status,
        source: "manual",
      })
      .select("id, title, description, status, due_date, importance, created_at, updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Erreur création" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
