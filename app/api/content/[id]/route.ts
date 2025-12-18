// app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + prompt/updated_at), sinon fallback FR.

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

type PatchBody = Partial<{
  title: string;
  content: string;
  prompt: string;
  type: string;
  status: "draft" | "planned" | "published" | "archived" | string;
  scheduledDate: string | null; // YYYY-MM-DD
  channel: string;
  tags: string[];
}>;

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | string | null;
  created_at: string | null;
  updated_at: string | null;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
}

function normalizeTags(input: unknown): string[] | string | null {
  if (input == null) return null;
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  if (typeof input === "string") return input;
  return null;
}

function normalizeItem(raw: Record<string, unknown>): ContentItem {
  return {
    id: String(raw["id"] ?? ""),
    type: (raw["type"] as string | null) ?? null,
    title: (raw["title"] as string | null) ?? null,
    prompt: (raw["prompt"] as string | null) ?? null,
    content: (raw["content"] as string | null) ?? null,
    status: (raw["status"] as string | null) ?? null,
    scheduled_date: (raw["scheduled_date"] as string | null) ?? null,
    channel: (raw["channel"] as string | null) ?? null,
    tags: normalizeTags(raw["tags"]),
    created_at: (raw["created_at"] as string | null) ?? null,
    updated_at: (raw["updated_at"] as string | null) ?? null,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const v2 = await supabase
      .from("content_item")
      .select("id, type, title, prompt, content, status, scheduled_date, channel, tags, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!v2.error) {
      const item = v2.data ? normalizeItem(v2.data as unknown as Record<string, unknown>) : null;
      return NextResponse.json({ ok: true, item }, { status: 200 });
    }

    if (!isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    const fb = await supabase
      .from("content_item")
      .select(
        "id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at"
      )
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (fb.error) {
      return NextResponse.json({ ok: false, error: fb.error.message }, { status: 400 });
    }
    if (!fb.data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const base = normalizeItem(fb.data as unknown as Record<string, unknown>);
    const item: ContentItem = {
      ...base,
      prompt: base.prompt ?? null,
      updated_at: base.updated_at ?? base.created_at ?? null,
    };

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    const patchV2: Record<string, unknown> = {};
    if (typeof body.title === "string") patchV2.title = body.title;
    if (typeof body.content === "string") patchV2.content = body.content;
    if (typeof body.prompt === "string") patchV2.prompt = body.prompt;
    if (typeof body.type === "string") patchV2.type = body.type;
    if (typeof body.status === "string") patchV2.status = body.status;
    if (typeof body.channel === "string") patchV2.channel = body.channel;
    if (Array.isArray(body.tags)) patchV2.tags = body.tags.filter(Boolean).map(String);
    if ("scheduledDate" in body) patchV2.scheduled_date = body.scheduledDate ?? null;

    const v2 = await supabase
      .from("content_item")
      .update(patchV2)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();

    if (!v2.error) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    // Fallback FR update (map fields)
    const patchFR: Record<string, unknown> = {};
    if (typeof body.title === "string") patchFR.titre = body.title;
    if (typeof body.content === "string") patchFR.contenu = body.content;
    if (typeof body.type === "string") patchFR.type = body.type;
    if (typeof body.status === "string") patchFR.statut = body.status;
    if (typeof body.channel === "string") patchFR.canal = body.channel;
    if ("scheduledDate" in body) patchFR.date_planifiee = body.scheduledDate ?? null;

    // tags (legacy FR = text)
    if (Array.isArray(body.tags)) patchFR.tags = body.tags.filter(Boolean).map(String).join(",");

    // prompt peut ne pas exister en FR -> tentative puis retry sans
    if (typeof body.prompt === "string") patchFR.prompt = body.prompt;

    let fb = await supabase.from("content_item").update(patchFR).eq("id", id).eq("user_id", auth.user.id);

    if (fb.error) {
      const err: PostgrestError = fb.error;
      if (isMissingColumnError(err.message) && "prompt" in patchFR) {
        const patchFR2 = { ...patchFR };
        delete (patchFR2 as Record<string, unknown>).prompt;
        fb = await supabase.from("content_item").update(patchFR2).eq("id", id).eq("user_id", auth.user.id);
      }
    }

    if (fb.error) {
      return NextResponse.json({ ok: false, error: fb.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabase.from("content_item").delete().eq("id", id).eq("user_id", auth.user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
