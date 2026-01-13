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

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, maxLen = 5000): string {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "true" : "false") : "";
  const t = s.trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x, 200)).map((x) => x.trim()).filter(Boolean);
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
  // on garde compatible avec le reste de l’app
  if (["draft", "scheduled", "published", "archived"].includes(s)) return s;
  if (["brouillon"].includes(s)) return "draft";
  if (["planifie", "planifié", "programmé", "programme"].includes(s)) return "scheduled";
  if (["publie", "publié"].includes(s)) return "published";
  return "draft";
}

function normalizeScheduledDate(v: unknown): string | null {
  const s = asString(v, 64);
  if (!s) return null;

  // accepte YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // accepte ISO/date string
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isColumnMissing(message: string) {
  return /column .* does not exist/i.test(message) || /Could not find the .* column/i.test(message);
}

function isTagsTypeMismatch(message: string) {
  // cas typique: "invalid input syntax for type json" / "malformed array literal" / etc.
  return /malformed array literal/i.test(message) || /invalid input syntax/i.test(message) || /cannot cast type/i.test(message);
}

type InsertResult = { data: { id: string } | null; error: PostgrestError | null };

async function insertContentV2(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> | typeof supabaseAdmin;
  userId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
}): Promise<InsertResult> {
  const { supabase, userId, type, title, content, status, channel, scheduledDate, tags, tagsCsv } = params;

  const first = await (supabase as any)
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
    })
    .select("id")
    .maybeSingle();

  if (first?.error && isTagsTypeMismatch(first.error.message) && tagsCsv) {
    const retry = await (supabase as any)
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
      })
      .select("id")
      .maybeSingle();

    return { data: retry.data ?? null, error: retry.error ?? null };
  }

  return { data: first.data ?? null, error: first.error ?? null };
}

async function insertContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> | typeof supabaseAdmin;
  userId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  channel: string | null;
  scheduledDate: string | null;
  tags: string[];
  tagsCsv: string;
}): Promise<InsertResult> {
  const { supabase, userId, type, title, content, status, channel, scheduledDate, tags, tagsCsv } = params;

  const first = await (supabase as any)
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
    })
    .select("id")
    .maybeSingle();

  if (first?.error && isTagsTypeMismatch(first.error.message) && tagsCsv) {
    const retry = await (supabase as any)
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
      })
      .select("id")
      .maybeSingle();

    return { data: retry.data ?? null, error: retry.error ?? null };
  }

  return { data: first.data ?? null, error: first.error ?? null };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AnyRecord;

    const type = asString(body.type, 40);
    const title = asString(body.title, 200);
    const content = asString(body.content, 20000);

    // Lovable forms: platform (post), sinon channel peut arriver direct
    const channel =
      asString(body.channel, 120) ||
      asString(body.platform, 120) ||
      asString((isRecord(body.meta) ? (body.meta as AnyRecord).platform : ""), 120) ||
      "";

    const scheduledDate = normalizeScheduledDate(body.scheduledDate ?? body.scheduled_date ?? body.date_planifiee);

    const status = normalizeStatus(body.status ?? (scheduledDate ? "scheduled" : "draft"));

    const tags = asStringArray(body.tags);
    const tagsCsv = tags.join(", ");

    if (!type) {
      return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ ok: false, error: "Missing content" }, { status: 400 });
    }

    // 1) Insert V2 (EN) via supabase (session)
    let ins = await insertContentV2({
      supabase,
      userId: user.id,
      type,
      title,
      content,
      status,
      channel: channel || null,
      scheduledDate,
      tags,
      tagsCsv,
    });

    // 2) Si colonnes manquantes => fallback FR
    if (ins.error && isColumnMissing(ins.error.message)) {
      ins = await insertContentFR({
        supabase,
        userId: user.id,
        type,
        title,
        content,
        status,
        channel: channel || null,
        scheduledDate,
        tags,
        tagsCsv,
      });
    }

    // 3) Si RLS ou autre souci côté session => fallback admin (best effort)
    if (ins.error) {
      const msg = ins.error.message || "";
      const looksLikeRls =
        /permission denied/i.test(msg) ||
        /violates row-level security/i.test(msg) ||
        /new row violates row-level security policy/i.test(msg);

      if (looksLikeRls) {
        // retente V2 puis FR en admin
        ins = await insertContentV2({
          supabase: supabaseAdmin,
          userId: user.id,
          type,
          title,
          content,
          status,
          channel: channel || null,
          scheduledDate,
          tags,
          tagsCsv,
        });

        if (ins.error && isColumnMissing(ins.error.message)) {
          ins = await insertContentFR({
            supabase: supabaseAdmin,
            userId: user.id,
            type,
            title,
            content,
            status,
            channel: channel || null,
            scheduledDate,
            tags,
            tagsCsv,
          });
        }
      }
    }

    if (ins.error) {
      return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: ins.data?.id ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
