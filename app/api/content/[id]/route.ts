// tipote-app/app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// ✅ Compat DB : prod = colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// ✅ Compat DB : certaines instances ont colonnes "EN/V2" (title/content/status/channel/scheduled_date, tags array)
// ✅ Certaines DB n'ont PAS updated_at et/ou prompt => retry sans ces colonnes
// ✅ PATCH supporte title/content/status/channel/type/scheduledDate/tags (+ prompt si présent)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

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
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function tagsToCsv(tags: unknown): string {
  return asTagsArray(tags).join(",");
}

async function getAuthedUserId() {
  // ✅ Cast any pour éviter ts(2590) / unions supabase trop complexes dans ce fichier
  const supabase = (await getSupabaseServerClient()) as any;
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

// Select strings (avec/sans updated_at ; avec prompt si présent)
const V2_SELECT_WITH_UPDATED =
  "id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,created_at,updated_at";
const V2_SELECT_NO_UPDATED =
  "id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,created_at";

const FR_SELECT_WITH_UPDATED =
  "id,user_id,type,titre,prompt,contenu,statut,date_planifiee,canal,tags,created_at,updated_at";
const FR_SELECT_NO_UPDATED =
  "id,user_id,type,titre,prompt,contenu,statut,date_planifiee,canal,tags,created_at";

async function fetchOne(supabase: any, id: string, userId: string) {
  // 1) V2
  let v2 = await supabase
    .from("content_item")
    .select(V2_SELECT_WITH_UPDATED)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (v2.error && isMissingColumnError(v2.error.message)) {
    v2 = await supabase
      .from("content_item")
      .select(V2_SELECT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (!v2.error) {
    if (!v2.data) return { ok: false as const, status: 404, error: "Not found" };
    return { ok: true as const, dto: dtoFromV2(v2.data) };
  }

  if (!isMissingColumnError(v2.error.message)) {
    return { ok: false as const, status: 400, error: v2.error.message };
  }

  // 2) FR
  let fr = await supabase
    .from("content_item")
    .select(FR_SELECT_WITH_UPDATED)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fr.error && isMissingColumnError(fr.error.message)) {
    fr = await supabase
      .from("content_item")
      .select(FR_SELECT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (fr.error) return { ok: false as const, status: 400, error: fr.error.message };
  if (!fr.data) return { ok: false as const, status: 404, error: "Not found" };
  return { ok: true as const, dto: dtoFromFR(fr.data) };
}

async function updateWithRetries(
  supabase: any,
  kind: "v2" | "fr",
  contentId: string,
  userId: string,
  patch: Record<string, any>,
  bodyTags: PatchBody["tags"],
) {
  const selectWith = kind === "v2" ? V2_SELECT_WITH_UPDATED : FR_SELECT_WITH_UPDATED;
  const selectNo = kind === "v2" ? V2_SELECT_NO_UPDATED : FR_SELECT_NO_UPDATED;

  // 1) try select WITH updated_at
  let res = await supabase
    .from("content_item")
    .update(patch as any)
    .eq("id", contentId)
    .eq("user_id", userId)
    .select(selectWith)
    .maybeSingle();

  // prompt missing -> retry sans prompt
  if (res.error && isMissingColumnError(res.error.message) && "prompt" in patch) {
    const { prompt, ...noPrompt } = patch;
    res = await supabase
      .from("content_item")
      .update(noPrompt as any)
      .eq("id", contentId)
      .eq("user_id", userId)
      .select(selectWith)
      .maybeSingle();
  }

  // updated_at missing -> retry select NO updated_at
  if (res.error && isMissingColumnError(res.error.message)) {
    res = await supabase
      .from("content_item")
      .update(patch as any)
      .eq("id", contentId)
      .eq("user_id", userId)
      .select(selectNo)
      .maybeSingle();

    if (res.error && isMissingColumnError(res.error.message) && "prompt" in patch) {
      const { prompt, ...noPrompt2 } = patch;
      res = await supabase
        .from("content_item")
        .update(noPrompt2 as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select(selectNo)
        .maybeSingle();
    }
  }

  // tags mismatch -> retry tags CSV (garde aussi les retries prompt/updated_at)
  if (res.error && isTagsTypeMismatch(res.error.message) && bodyTags !== undefined) {
    const retryPatch: Record<string, any> = { ...patch, tags: tagsToCsv(bodyTags) };

    res = await supabase
      .from("content_item")
      .update(retryPatch as any)
      .eq("id", contentId)
      .eq("user_id", userId)
      .select(selectWith)
      .maybeSingle();

    if (res.error && isMissingColumnError(res.error.message) && "prompt" in retryPatch) {
      const { prompt, ...noPrompt } = retryPatch;
      res = await supabase
        .from("content_item")
        .update(noPrompt as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select(selectWith)
        .maybeSingle();
    }

    if (res.error && isMissingColumnError(res.error.message)) {
      res = await supabase
        .from("content_item")
        .update(retryPatch as any)
        .eq("id", contentId)
        .eq("user_id", userId)
        .select(selectNo)
        .maybeSingle();

      if (res.error && isMissingColumnError(res.error.message) && "prompt" in retryPatch) {
        const { prompt, ...noPrompt2 } = retryPatch;
        res = await supabase
          .from("content_item")
          .update(noPrompt2 as any)
          .eq("id", contentId)
          .eq("user_id", userId)
          .select(selectNo)
          .maybeSingle();
      }
    }
  }

  return res;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const contentId = String(ctx.params?.id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const res = await fetchOne(supabase, contentId, userId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

    return NextResponse.json({ ok: true, item: res.dto }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const contentId = String(ctx.params?.id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    // si body vide -> renvoyer l'item actuel
    const hasAnyField =
      body.title !== undefined ||
      body.content !== undefined ||
      body.prompt !== undefined ||
      body.type !== undefined ||
      body.status !== undefined ||
      body.channel !== undefined ||
      body.scheduledDate !== undefined ||
      body.tags !== undefined;

    if (!hasAnyField) {
      const current = await fetchOne(supabase, contentId, userId);
      if (!current.ok) return NextResponse.json({ ok: false, error: current.error }, { status: current.status });
      return NextResponse.json({ ok: true, item: current.dto }, { status: 200 });
    }

    // 1) Try V2
    const patchV2: Record<string, any> = {};
    if (body.title !== undefined) patchV2.title = body.title;
    if (body.content !== undefined) patchV2.content = body.content;
    if (body.prompt !== undefined) patchV2.prompt = body.prompt;
    if (body.type !== undefined) patchV2.type = body.type;
    if (body.status !== undefined) patchV2.status = body.status;
    if (body.channel !== undefined) patchV2.channel = body.channel;
    if (body.scheduledDate !== undefined) patchV2.scheduled_date = body.scheduledDate;
    if (body.tags !== undefined) patchV2.tags = body.tags;

    const v2 = await updateWithRetries(supabase, "v2", contentId, userId, patchV2, body.tags);

    if (!v2.error && v2.data) {
      return NextResponse.json({ ok: true, item: dtoFromV2(v2.data) }, { status: 200 });
    }

    if (v2.error && !isMissingColumnError(v2.error.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    // 2) Fallback FR
    const patchFR: Record<string, any> = {};
    if (body.title !== undefined) patchFR.titre = body.title;
    if (body.content !== undefined) patchFR.contenu = body.content;
    if (body.prompt !== undefined) patchFR.prompt = body.prompt;
    if (body.type !== undefined) patchFR.type = body.type;
    if (body.status !== undefined) patchFR.statut = body.status;
    if (body.channel !== undefined) patchFR.canal = body.channel;
    if (body.scheduledDate !== undefined) patchFR.date_planifiee = body.scheduledDate;
    if (body.tags !== undefined) patchFR.tags = body.tags;

    const fr = await updateWithRetries(supabase, "fr", contentId, userId, patchFR, body.tags);

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 });
    if (!fr.data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, item: dtoFromFR(fr.data) }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const contentId = String(ctx.params?.id ?? "").trim();
    if (!contentId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { supabase, userId, authError } = await getAuthedUserId();
    if (authError) return NextResponse.json({ ok: false, error: authError }, { status: 401 });
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const del = await supabase.from("content_item").delete().eq("id", contentId).eq("user_id", userId);
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
