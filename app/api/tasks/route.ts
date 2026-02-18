// app/api/tasks/route.ts
// GET: liste des tâches (table public.project_tasks)
// POST: création d'une tâche (source='manual')
// ✅ MULTI-PROJETS : scoped au projet actif via cookie

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureDefaultProject } from "@/lib/projects/ensureDefaultProject";

type CreateBody = {
  title?: unknown;
  due_date?: unknown;
  priority?: unknown;
  importance?: unknown; // compat ancienne UI
  status?: unknown;
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

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    let query = supabase
      .from("project_tasks")
      .select("id, title, status, priority, source, created_at, updated_at")
      .eq("user_id", auth.user.id);

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query
      .order("created_at", { ascending: true });

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

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    const raw = (await req.json()) as CreateBody;

    const title = cleanString(raw.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
    }

    const due_date = normalizeDueDate(raw.due_date);
    const priority = normalizePriority(raw.priority ?? raw.importance);

    const st = cleanNullableString(raw.status);
    const status = st ? st : "todo";

    if (!projectId) {
      // Auto-heal: create a default project for beta users who don't have one yet
      projectId = await ensureDefaultProject(auth.user.id);
      if (!projectId) {
        return NextResponse.json(
          { ok: false, error: "Impossible de déterminer le projet actif. Recharge la page." },
          { status: 400 },
        );
      }
    }

    const insertPayload: Record<string, unknown> = {
      user_id: auth.user.id,
      project_id: projectId,
      title,
      status,
      due_date,
      priority,
      source: "manual",
    };

    const { data, error } = await supabaseAdmin
      .from("project_tasks")
      .insert(insertPayload)
      .select("id, title, status, priority, due_date, source, created_at, updated_at")
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
