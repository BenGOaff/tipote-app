// app/api/contents/route.ts
// Create content_item (POST) — utilisé par la page Lovable /create
// ✅ Compat DB : certaines instances ont colonnes EN/V2 (type/title/content/status/channel/scheduled_date, tags array|text)
// ✅ Compat DB : certaines instances ont colonnes FR (type/titre/contenu/statut/canal/date_planifiee, tags text)
// ✅ RLS-safe : on tente d’abord avec supabase server (session), puis fallback supabaseAdmin si besoin
// ✅ Retour JSON simple { ok, id }

import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, maxLen = 5000): string {
  const s =
    typeof v === "string"
      ? v
      : typeof v === "number"
        ? String(v)
        : typeof v === "boolean"
          ? v
            ? "true"
            : "false"
          : "";
  const t = s.trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => asString(x, 200)).map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    const parts = s.includes("|") ? s.split("|") : s.split(",");
    return parts.map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function normalizeStatus(v: unknown): string {
  const s = asString(v, 40).toLowerCase();
  if (!s) return "draft";
  if (["draft", "scheduled", "published", "archived"].includes(s)) return s;
  if (["brouillon"].includes(s)) return "draft";
  if (["planifie", "planifié", "programmé", "programme"].includes(s)) return "scheduled";
  if (["publie", "publié"].includes(s)) return "published";
  return "draft";
}

function normalizeScheduledDate(v: unknown): string | null {
  const s = asString(v, 64);
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isColumnMissing(message: string) {
  return /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message);
}

function isTagsTypeMismatch(message: string) {
  return /malformed array literal/i.test(message) ||
    /invalid input syntax/i.test(message) ||
    /cannot cast type/i.test(message);
}

type InsertResult = { data: { id: string } | null; error: PostgrestError | null };

async function insertContentV2(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> | typeof supabaseAdmin;
  userId: string;
  projectId: string | null;
  type: string;
  title: string;
  content: string;
  status: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
  meta: AnyRecord | null;
}): Promise<InsertResult> {
  const { supabase, userId, projectId, type, title, content, status, channel, scheduledDate, tags, tagsCsv, meta } = params;

  const basePayload: AnyRecord = {
    user_id: userId,
    type,
    title,
    content,
    status,
    channel,
    scheduled_date: scheduledDate,
    tags,
  };

  if (projectId) basePayload.project_id = projectId;
  if (meta) basePayload.meta = meta;

  let first = await (supabase as any)
    .from("content_item")
    .insert(basePayload)
    .select("id")
    .maybeSingle();

  // tags mismatch fallback (array vs text)
  if (first?.error && isTagsTypeMismatch(first.error.message) && tagsCsv) {
    const retryPayload: AnyRecord = {
      user_id: userId,
      type,
      title,
      content,
      status,
      channel,
      scheduled_date: scheduledDate,
      tags: tagsCsv,
    };
    if (projectId) retryPayload.project_id = projectId;
    if (meta) retryPayload.meta = meta;

    first = await (supabase as any)
      .from("content_item")
      .insert(retryPayload)
      .select("id")
      .maybeSingle();
  }

  // meta missing fallback
  if (first?.error && meta && isColumnMissing(first.error.message)) {
    // retry without meta
    let retry = await (supabase as any)
      .from("content_item")
      .insert({
        user_id: userId,
        type,
        title,
        content,
        status,
        channel,
        scheduled_date: scheduledDate,
        tags,
        ...(projectId ? { project_id: projectId } : {}),
      })
      .select("id")
      .maybeSingle();

    if (retry?.error && isTagsTypeMismatch(retry.error.message) && tagsCsv) {
      retry = await (supabase as any)
        .from("content_item")
        .insert({
          user_id: userId,
          type,
          title,
          content,
          status,
          channel,
          scheduled_date: scheduledDate,
          tags: tagsCsv,
          ...(projectId ? { project_id: projectId } : {}),
        })
        .select("id")
        .maybeSingle();
    }

    return { data: retry.data ?? null, error: retry.error ?? null };
  }

  return { data: first.data ?? null, error: first.error ?? null };
}

async function insertContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> | typeof supabaseAdmin;
  userId: string;
  projectId: string | null;
  type: string;
  title: string;
  content: string;
  status: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
  meta: AnyRecord | null;
}): Promise<InsertResult> {
  const { supabase, userId, projectId, type, title, content, status, channel, scheduledDate, tags, tagsCsv, meta } = params;

  const basePayload: AnyRecord = {
    user_id: userId,
    type,
    titre: title,
    contenu: content,
    statut: status,
    canal: channel,
    date_planifiee: scheduledDate,
    tags,
  };

  if (projectId) basePayload.project_id = projectId;
  if (meta) basePayload.meta = meta;

  let first = await (supabase as any)
    .from("content_item")
    .insert(basePayload)
    .select("id")
    .maybeSingle();

  if (first?.error && isTagsTypeMismatch(first.error.message) && tagsCsv) {
    const retryPayload: AnyRecord = {
      user_id: userId,
      type,
      titre: title,
      contenu: content,
      statut: status,
      canal: channel,
      date_planifiee: scheduledDate,
      tags: tagsCsv,
    };
    if (projectId) retryPayload.project_id = projectId;
    if (meta) retryPayload.meta = meta;

    first = await (supabase as any)
      .from("content_item")
      .insert(retryPayload)
      .select("id")
      .maybeSingle();
  }

  if (first?.error && meta && isColumnMissing(first.error.message)) {
    let retry = await (supabase as any)
      .from("content_item")
      .insert({
        user_id: userId,
        type,
        titre: title,
        contenu: content,
        statut: status,
        canal: channel,
        date_planifiee: scheduledDate,
        tags,
        ...(projectId ? { project_id: projectId } : {}),
      })
      .select("id")
      .maybeSingle();

    if (retry?.error && isTagsTypeMismatch(retry.error.message) && tagsCsv) {
      retry = await (supabase as any)
        .from("content_item")
        .insert({
          user_id: userId,
          type,
          titre: title,
          contenu: content,
          statut: status,
          canal: channel,
          date_planifiee: scheduledDate,
          tags: tagsCsv,
          ...(projectId ? { project_id: projectId } : {}),
        })
        .select("id")
        .maybeSingle();
    }

    return { data: retry.data ?? null, error: retry.error ?? null };
  }

  return { data: first.data ?? null, error: first.error ?? null };
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AnyRecord = {};
  try {
    body = (await req.json()) as AnyRecord;
  } catch {
    body = {};
  }

  const userId = session.user.id;
  const projectId = await getActiveProjectId(supabase, userId);

  const type = asString(body.type, 80) || "post";
  const title = asString(body.title, 240);
  const content = asString(body.content, 100000);
  const status = normalizeStatus(body.status);
  const channel =
    asString(body.channel, 120) ||
    asString(body.platform, 120) ||
    asString((isRecord(body.meta) ? (body.meta as AnyRecord).platform : ""), 120) ||
    "";
  const scheduledDate = normalizeScheduledDate(body.scheduledDate ?? body.scheduled_date ?? body.date_planifiee);
  const tags = asStringArray(body.tags);
  const tagsCsv = tags.join(",");

  const meta = isRecord(body.meta) ? (body.meta as AnyRecord) : null;

  // 1) try V2 columns
  let inserted: InsertResult = { data: null, error: null };
  inserted = await insertContentV2({
    supabase,
    userId,
    projectId,
    type,
    title,
    content,
    status,
    channel: channel || null,
    scheduledDate,
    tags,
    tagsCsv,
    meta,
  });

  // if missing V2 columns -> fallback FR
  if (inserted.error && isColumnMissing(inserted.error.message)) {
    inserted = await insertContentFR({
      supabase,
      userId,
      projectId,
      type,
      title,
      content,
      status,
      channel: channel || null,
      scheduledDate,
      tags,
      tagsCsv,
      meta,
    });
  }

  // if still failing, try admin fallback (RLS)
  if (inserted.error) {
    // retry V2 with admin
    inserted = await insertContentV2({
      supabase: supabaseAdmin,
      userId,
      projectId,
      type,
      title,
      content,
      status,
      channel: channel || null,
      scheduledDate,
      tags,
      tagsCsv,
      meta,
    });

    if (inserted.error && isColumnMissing(inserted.error.message)) {
      inserted = await insertContentFR({
        supabase: supabaseAdmin,
        userId,
        projectId,
        type,
        title,
        content,
        status,
        channel: channel || null,
        scheduledDate,
        tags,
        tagsCsv,
        meta,
      });
    }
  }

  if (inserted.error || !inserted.data?.id) {
    return NextResponse.json(
      { error: inserted.error?.message || "Insert failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: inserted.data.id });
}
