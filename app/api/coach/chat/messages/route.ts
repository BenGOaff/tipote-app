// app/api/coach/messages/route.ts
// Persistance mémoire Coach IA (Supabase table: public.coach_messages)
//
// - GET  /api/coach/messages?limit=20  => derniers messages (ordre chronologique)
// - POST /api/coach/messages          => insère 1..n messages (user/assistant)
//
// IMPORTANT : utilise le client server Supabase (anon + cookies) pour respecter RLS.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RoleSchema = z.enum(["user", "assistant"]);

const MessageSchema = z
  .object({
    role: RoleSchema,
    content: z.string().trim().min(1).max(8000),
    summary_tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    facts: z.record(z.unknown()).optional(),
  })
  .strict();

const PostBodySchema = z
  .union([
    z.object({ messages: z.array(MessageSchema).min(1).max(10) }).strict(),
    MessageSchema,
  ])
  .transform((v) => {
    // normalise en array
    if ("messages" in (v as any)) return (v as any).messages as z.infer<typeof MessageSchema>[];
    return [v as z.infer<typeof MessageSchema>];
  });

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw ? Number(limitRaw) : 20;
    const limit = Number.isFinite(limitParsed) ? Math.max(1, Math.min(50, limitParsed)) : 20;

    let query = supabase
      .from("coach_messages")
      .select("id, role, content, summary_tags, facts, created_at")
      .eq("user_id", user.id);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // On renvoie en ordre chronologique (asc) pour l'UI
    const items = (data ?? []).slice().reverse();

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PostBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const rows = parsed.data.map((m) => ({
      user_id: user.id,
      ...(projectId ? { project_id: projectId } : {}),
      role: m.role,
      content: m.content,
      summary_tags: m.summary_tags ?? null,
      facts: m.facts ?? null,
    }));

    const { data, error } = await supabase
      .from("coach_messages")
      .insert(rows)
      .select("id, role, content, summary_tags, facts, created_at");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
