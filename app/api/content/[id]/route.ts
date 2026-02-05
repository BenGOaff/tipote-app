// tipote-app/app/api/content/[id]/route.ts
// CRUD simple pour un content_item (GET, PATCH, DELETE)
// ✅ Compat DB : prod = colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// ✅ Compat DB : certaines instances ont colonnes "EN/V2" (title/content/status/channel/scheduled_date, tags array)
// ✅ Certaines DB n'ont PAS prompt / updated_at => retry sans ces colonnes
// ✅ PATCH supporte title/content/status/channel/type/scheduledDate/tags (+ prompt si présent) + meta (si présent)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// ⚠️ Chez toi, Next attend params en Promise (cf ton erreur build)
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
  meta?: Record<string, any> | null;
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
  meta?: Record<string, any> | null;
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

function normalizeScheduledDate(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const V2_SEL_WITH_PROMPT_UPDATED = "id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,meta,created_at,updated_at";
const V2_SEL_WITH_PROMPT_NO_UPDATED = "id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags,meta,created_at";
const V2_SEL_NO_PROMPT_NO_UPDATED = "id,user_id,type,title,content,status,scheduled_date,channel,tags,meta,created_at";

const FR_SEL_WITH_PROMPT_UPDATED = "id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,prompt,meta,created_at,updated_at";
const FR_SEL_WITH_PROMPT_NO_UPDATED = "id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,prompt,meta,created_at";
const FR_SEL_NO_PROMPT_NO_UPDATED = "id,user_id,type,titre,contenu,statut,date_planifiee,canal,tags,meta,created_at";

function toDTOFromV2(row: any): ContentItemDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type ?? null,
    title: row.title ?? null,
    prompt: row.prompt ?? null,
    content: row.content ?? null,
    status: row.status ?? null,
    scheduled_date: row.scheduled_date ?? null,
    channel: row.channel ?? null,
    tags: asTagsArray(row.tags),
    meta: row.meta ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function toDTOFromFR(row: any): ContentItemDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type ?? null,
    title: row.titre ?? null,
    prompt: row.prompt ?? null,
    content: row.contenu ?? null,
    status: row.statut ?? null,
    scheduled_date: row.date_planifiee ?? null,
    channel: row.canal ?? null,
    tags: asTagsArray(row.tags),
    meta: row.meta ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // 1) try V2 select variants
  let v2 = await supabase
    .from("content_item")
    .select(V2_SEL_WITH_PROMPT_UPDATED)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (v2.error && isMissingColumnError(v2.error.message)) {
    v2 = await supabase
      .from("content_item")
      .select(V2_SEL_WITH_PROMPT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (v2.error && isMissingColumnError(v2.error.message)) {
    v2 = await supabase
      .from("content_item")
      .select(V2_SEL_NO_PROMPT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (!v2.error && v2.data) {
    return NextResponse.json({ ok: true, item: toDTOFromV2(v2.data) });
  }

  // 2) fallback FR
  let fr = await supabase
    .from("content_item")
    .select(FR_SEL_WITH_PROMPT_UPDATED)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fr.error && isMissingColumnError(fr.error.message)) {
    fr = await supabase
      .from("content_item")
      .select(FR_SEL_WITH_PROMPT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (fr.error && isMissingColumnError(fr.error.message)) {
    fr = await supabase
      .from("content_item")
      .select(FR_SEL_NO_PROMPT_NO_UPDATED)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
  }

  if (fr.error || !fr.data) {
    return NextResponse.json(
      { error: fr.error?.message || v2.error?.message || "Not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, item: toDTOFromFR(fr.data) });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    body = {};
  }

  const scheduledDate = normalizeScheduledDate(body.scheduledDate);

  const tagsArr = asTagsArray(body.tags);
  const tagsCsv = tagsToCsv(body.tags);

  const metaObj =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as any)
      : null;

  // Helper to attempt update with select + retry on missing columns
  const tryUpdate = async (payload: Record<string, any>, selectStr: string) => {
    return await supabase
      .from("content_item")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select(selectStr)
      .maybeSingle();
  };

  // Prefer V2 update first
  const baseV2: Record<string, any> = {};
  if ("type" in body) baseV2.type = body.type;
  if ("title" in body) baseV2.title = body.title;
  if ("prompt" in body) baseV2.prompt = body.prompt;
  if ("content" in body) baseV2.content = body.content;
  if ("status" in body) baseV2.status = body.status;
  if ("channel" in body) baseV2.channel = body.channel;
  if ("scheduledDate" in body) baseV2.scheduled_date = scheduledDate;

  if ("tags" in body) baseV2.tags = tagsArr;

  if (metaObj) baseV2.meta = metaObj;

  let v2 = await tryUpdate(baseV2, V2_SEL_WITH_PROMPT_UPDATED);

  if (v2.error && isTagsTypeMismatch(v2.error.message) && ("tags" in body) && tagsCsv) {
    const retry = { ...baseV2, tags: tagsCsv };
    v2 = await tryUpdate(retry, V2_SEL_WITH_PROMPT_UPDATED);
  }

  if (v2.error && metaObj && isMissingColumnError(v2.error.message)) {
    const { meta, ...withoutMeta } = baseV2;
    v2 = await tryUpdate(withoutMeta, V2_SEL_WITH_PROMPT_UPDATED);
  }

  if (v2.error && isMissingColumnError(v2.error.message)) {
    v2 = await tryUpdate(baseV2, V2_SEL_WITH_PROMPT_NO_UPDATED);
  }

  if (v2.error && isMissingColumnError(v2.error.message)) {
    v2 = await tryUpdate(baseV2, V2_SEL_NO_PROMPT_NO_UPDATED);
  }

  if (!v2.error && v2.data) {
    return NextResponse.json({ ok: true, item: toDTOFromV2(v2.data) });
  }

  // Fallback FR update
  const baseFR: Record<string, any> = {};
  if ("type" in body) baseFR.type = body.type;
  if ("title" in body) baseFR.titre = body.title;
  if ("prompt" in body) baseFR.prompt = body.prompt;
  if ("content" in body) baseFR.contenu = body.content;
  if ("status" in body) baseFR.statut = body.status;
  if ("channel" in body) baseFR.canal = body.channel;
  if ("scheduledDate" in body) baseFR.date_planifiee = scheduledDate;

  if ("tags" in body) baseFR.tags = tagsArr;

  if (metaObj) baseFR.meta = metaObj;

  let fr = await tryUpdate(baseFR, FR_SEL_WITH_PROMPT_UPDATED);

  if (fr.error && isTagsTypeMismatch(fr.error.message) && ("tags" in body) && tagsCsv) {
    const retry = { ...baseFR, tags: tagsCsv };
    fr = await tryUpdate(retry, FR_SEL_WITH_PROMPT_UPDATED);
  }

  if (fr.error && metaObj && isMissingColumnError(fr.error.message)) {
    const { meta, ...withoutMeta } = baseFR;
    fr = await tryUpdate(withoutMeta, FR_SEL_WITH_PROMPT_UPDATED);
  }

  if (fr.error && isMissingColumnError(fr.error.message)) {
    fr = await tryUpdate(baseFR, FR_SEL_WITH_PROMPT_NO_UPDATED);
  }

  if (fr.error && isMissingColumnError(fr.error.message)) {
    fr = await tryUpdate(baseFR, FR_SEL_NO_PROMPT_NO_UPDATED);
  }

  if (fr.error || !fr.data) {
    return NextResponse.json(
      { error: fr.error?.message || v2.error?.message || "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, item: toDTOFromFR(fr.data) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const del = await supabase
    .from("content_item")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (del.error) {
    return NextResponse.json(
      { error: del.error.message || "Delete failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
