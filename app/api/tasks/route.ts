// app/api/tasks/route.ts
// GET: liste des tâches (table tasks)
// POST: création d'une tâche

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type CreateBody = {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  importance?: unknown; // "high" | null
  status?: unknown; // "todo" | "done" | ...
};

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

    const raw = (await req.json()) as CreateBody;

    const title = cleanString(raw.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
    }

    const description = cleanNullableString(raw.description);

    let due_date = cleanNullableString(raw.due_date);
    if (due_date && !isIsoDateYYYYMMDD(due_date)) {
      // accepte ISO complet, et tronque
      const d = new Date(due_date);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ ok: false, error: "Date invalide" }, { status: 400 });
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      due_date = `${yyyy}-${mm}-${dd}`;
    }

    const imp = cleanNullableString(raw.importance);
    const importance = imp && imp.toLowerCase() === "high" ? "high" : null;

    const st = cleanNullableString(raw.status);
    const status = st ? st : "todo";

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: auth.user.id,
        title,
        description,
        due_date,
        importance,
        status,
      })
      .select("id, title, description, status, due_date, importance, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
