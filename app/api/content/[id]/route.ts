// tipote-app/app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// ✅ Compat DB : prod = colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// ✅ Compat DB : certaines instances ont colonnes "EN/V2" (title/content/status/channel/scheduled_date, tags array)
// ✅ Certaines DB n'ont PAS prompt / updated_at => retry sans ces colonnes (sinon: "column content_item.prompt does not exist")
// ✅ PATCH supporte title/content/status/channel/type/scheduledDate/tags (+ prompt si présent)

import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ id: string }> };

type ContentItemDTO = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
};

type PatchBody = {
  type?: string | null;
  title?: string | null;
  prompt?: string | null;
  content?: string | null;
  status?: string | null;
  scheduledDate?: string | null;
  channel?: string | null;
  tags?: string[] | string | null;
};

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
  );
}

function isTagsTypeMismatch(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return m.includes("malformed array") || m.includes("invalid input") || m.includes("array");
}

function asTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof tags === "string")
    return tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function tagsToCsv(tags: unknown): string {
  const arr = asTagsArray(tags);
  return arr.join(",");
}

async function getAuthedUserId() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { supabase, userId: null as string | null, authError: error.message };
  return { supabase, userId: data.user?.id ?? null, authError: null as string | null };
}

function dtoFromV2(row: any): ContentItemDTO {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: typeof row.type === "string" ? row.type : row.type ?? null,
    title: typeof row.title === "string" ? row.title : row.title ?? null,
    prompt: typeof row.prompt === "string" ? row.prompt : row.prompt ?? null,
    content: typeof row.content === "string" ? row.content : row.content ?? null,
    status: typeof row.status === "string" ? row.status : row.status ?? null,
    scheduled_date: typeof row.scheduled_date === "string" ? row.scheduled_date : row.scheduled_date ?? null,
    channel: typeof row.channel === "string" ? row.channel : row.channel ?? null,
    tags: asTagsArray(row.tags),
    created_at: typeof row.created_at === "string" ? row.created_at : row.created_at ?? null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : row.updated_at ?? null,
  };
}

function dtoFromFR(row: any): ContentItemDTO {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: typeof row.type === "string" ? row.type : row.type ?? null,
    title: typeof row.titre === "string" ? row.titre : row.titre ?? null,
    prompt: typeof row.prompt === "string" ? row.prompt : row.prompt ?? null,
    content: typeof row.contenu === "string" ? row.contenu : row.contenu ?? null,
    status: typeof row.statut === "string" ? row.statut : row.statut ?? null,
    scheduled_date: typeof row.date_planifiee === "string" ? row.date_planifiee : row.date_planifiee ?? null,
    channel: typeof row.canal === "string" ? row.canal : row.canal ?? null,
    tags: asTagsArray(row.tags),
    created_at: typeof row.created_at === "string" ? row.created_at : row.created_at ?? null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : row.updated_at ?? null,
  };
}

async function fetchOne(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  id: string,
  userId: string,
): Promise<{ ok: true; dto: ContentItemDTO } | { ok: false; status: number; error: string }> {
  // 1) V2 try (avec prompt/updated_at)
  const v2 = await supabase
    .from("content_item")
    .select("id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!v2.error) {
    if (!v2.data) return { ok: false, status: 404, error: "Not found" };
    return { ok: true, dto: dtoFromV2(v2.data) };
  }

  if (!isMissingColumnError(v2.error.message)) {
    return { ok: false, status: 400, error: v2.error.message };
  }

  // 2) V2 retry sans prompt/updated_at
  const v2retry = await supabase
    .from("content_item")
    .select("id,user_id,type,title,content,status,scheduled_date,channel,tags,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!v2retry.error) {
    if (v2retry.data) {
      const row = { ...v2retry.data, prompt: null, updated_at: null };
      return { ok: true, dto: dtoFromV2(row) };
    }
    // Not found => on tente FR (car prod actuel FR)
  } else if (!isMissingColumnError(v2retry.error.message)) {
    return { ok: false, status: 400, error: v2retry.error.message };
  }

  // 3) FR try (avec prompt/updated_at)
  const fr = await supabase
    .from("content_item")
    .select("id,user_id,type,titre,prompt,contenu,statut,date_planifiee,canal,tags,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!fr.error) {
    if (!fr.data) return { ok: false, status: 404, error: "Not found" };
    return { ok: true, dto: dtoFromFR(fr.data) };
  }

  if (!isMissingColumnError(fr.error.message)) {
    return { ok: false, status: 400, error: fr.error.message };
  }

  // 4) FR retry sans prompt/updated_at
  const frRetry = await supabase
    .from("content_item")
    .select("id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (frRetry.error) return { ok: false, status: 400, error: frRetry.error.message };
  if (!frRetry.data) return { ok: false, status: 404, error: "Not found" };

  const row = { ...frRetry.data, prompt: null, updated_at: null };
  return { ok: true, dto: dtoFromFR(row) };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const contentId = String(id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const res = await fetchOne(supabase, contentId, userId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

    return NextResponse.json({ ok: true, item: res.dto }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const contentId = String(id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    // -------------------------
    // 1) Try V2 update
    // -------------------------
    const patchV2: Record<string, any> = {};
    if (body.title !== undefined) patchV2.title = body.title;
    if (body.content !== undefined) patchV2.content = body.content;
    if (body.prompt !== undefined) patchV2.prompt = body.prompt;
    if (body.type !== undefined) patchV2.type = body.type;
    if (body.status !== undefined) patchV2.status = body.status;
    if (body.channel !== undefined) patchV2.channel = body.channel;
    if (body.scheduledDate !== undefined) patchV2.scheduled_date = body.scheduledDate;
    if (body.tags !== undefined) patchV2.tags = body.tags;

    // Update + select (avec prompt/updated_at)
    let v2 = await supabase
      .from("content_item")
      .update(patchV2 as any)
      .eq("id", contentId)
      .eq("user_id", userId)
      .select("id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,created_at,updated_at")
      .maybeSingle();

    // Si prompt n'existe pas => retry sans prompt
    if (v2.error && isMissingColumnError(v2.error.message) && "prompt" in patchV2) {
      const { prompt, ...noPrompt } = patchV2;
      v2 = await supabase
        .from("content_item")
        .update(noPrompt as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select("id,user_id,type,title,content,status,scheduled_date,channel,tags,created_at")
        .maybeSingle();
    }

    // tags mismatch (array vs text)
    if (v2.error && isTagsTypeMismatch(v2.error.message) && body.tags !== undefined) {
      const retryPatch = { ...patchV2, tags: tagsToCsv(body.tags) };
      // prompt might not exist too => handle below
      v2 = await supabase
        .from("content_item")
        .update(retryPatch as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select("id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,created_at,updated_at")
        .maybeSingle();

      if (v2.error && isMissingColumnError(v2.error.message) && "prompt" in retryPatch) {
        const { prompt, ...noPrompt2 } = retryPatch;
        v2 = await supabase
          .from("content_item")
          .update(noPrompt2 as any)
          .eq("id", contentId)
          .eq("user_id", userId)
          .select("id,user_id,type,title,content,status,scheduled_date,channel,tags,created_at")
          .maybeSingle();
      }
    }

    if (!v2.error && v2.data) {
      const dto = dtoFromV2(v2.data);
      return NextResponse.json({ ok: true, item: dto }, { status: 200 });
    }

    // Si erreur autre que "colonnes manquantes" => stop
    if (v2.error && !isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    // -------------------------
    // 2) Fallback FR update
    // -------------------------
    const patchFR: Record<string, any> = {};
    if (body.title !== undefined) patchFR.titre = body.title;
    if (body.content !== undefined) patchFR.contenu = body.content;
    if (body.prompt !== undefined) patchFR.prompt = body.prompt; // optionnel (souvent absent)
    if (body.type !== undefined) patchFR.type = body.type;
    if (body.status !== undefined) patchFR.statut = body.status;
    if (body.channel !== undefined) patchFR.canal = body.channel;
    if (body.scheduledDate !== undefined) patchFR.date_planifiee = body.scheduledDate;
    if (body.tags !== undefined) patchFR.tags = body.tags;

    let fr = await supabase
      .from("content_item")
      .update(patchFR as any)
      .eq("id", contentId)
      .eq("user_id", userId)
      .select("id,user_id,type,titre,prompt,contenu,statut,date_planifiee,canal,tags,created_at,updated_at")
      .maybeSingle();

    // prompt absent => retry sans prompt
    if (fr.error && isMissingColumnError(fr.error.message) && "prompt" in patchFR) {
      const { prompt, ...noPromptFR } = patchFR;
      fr = await supabase
        .from("content_item")
        .update(noPromptFR as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select("id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,created_at")
        .maybeSingle();
    }

    // tags mismatch => retry tags en CSV
    if (fr.error && isTagsTypeMismatch(fr.error.message) && body.tags !== undefined) {
      const retryPatchFR = { ...patchFR, tags: tagsToCsv(body.tags) };

      fr = await supabase
        .from("content_item")
        .update(retryPatchFR as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select("id,user_id,type,titre,prompt,contenu,statut,date_planifiee,canal,tags,created_at,updated_at")
        .maybeSingle();

      if (fr.error && isMissingColumnError(fr.error.message) && "prompt" in retryPatchFR) {
        const { prompt, ...noPromptFR2 } = retryPatchFR;
        fr = await supabase
          .from("content_item")
          .update(noPromptFR2 as any)
          .eq("id", contentId)
          .eq("user_id", userId)
          .select("id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,created_at")
          .maybeSingle();
      }
    }

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 });
    if (!fr.data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const dto = dtoFromFR(fr.data);
    return NextResponse.json({ ok: true, item: dto }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const contentId = String(id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const del = await supabase.from("content_item").delete().eq("id", contentId).eq("user_id", userId);
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
