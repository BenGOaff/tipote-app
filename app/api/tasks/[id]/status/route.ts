// app/api/tasks/[id]/status/route.ts
// Rôle : mettre à jour le status d’une tâche (todo <-> done)
// ✅ Aucun impact sur la structure existante
// ✅ Autorise manual + strategy
// ✅ Sécurisé user_id
//
// FIX PROD (Next.js 15/16 types):
// context.params est typé Promise<{ id: string }>

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Params = { id: string };

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<Params> },
) {
  try {
    const { id } = await context.params;

    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const taskId = id;
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "Missing task id" }, { status: 400 });
    }

    // Body optionnel : si absent => on met "done" par défaut
    const body = await req.json().catch(() => null);
    const statusRaw = body?.status;
    const status = statusRaw ?? "done";

    if (status !== "todo" && status !== "done") {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_tasks")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("user_id", auth.user.id)
      .select("id,status")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, task: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
