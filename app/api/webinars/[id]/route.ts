// app/api/webinars/[id]/route.ts
// PATCH  — update webinar (info + KPIs)
// DELETE — delete webinar

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    const allowedStrings = ["title", "topic", "offer_name", "status", "notes", "program"];
    // JSONB fields
    if (body.playbook_progress !== undefined) updates.playbook_progress = body.playbook_progress ?? {};
    if (body.playbook_data !== undefined) updates.playbook_data = body.playbook_data ?? {};
    for (const key of allowedStrings) {
      if (body[key] !== undefined) {
        updates[key] = typeof body[key] === "string" ? body[key].trim() || null : body[key];
      }
    }
    if (body.title !== undefined) updates.title = body.title.trim(); // title is required

    if (body.webinar_date !== undefined) updates.webinar_date = body.webinar_date || null;
    if (body.end_date !== undefined) updates.end_date = body.end_date || null;
    // offer_id must be a valid UUID — reject synthetic IDs like "user:xxx:0"
    if (body.offer_id !== undefined) {
      updates.offer_id = body.offer_id && UUID_RE.test(body.offer_id) ? body.offer_id : null;
    }
    if (body.event_type !== undefined) {
      updates.event_type = body.event_type === "challenge" ? "challenge" : "webinar";
    }

    const allowedNumbers = [
      "registrants", "attendees", "replay_viewers",
      "offers_presented", "sales_count", "revenue",
    ];
    for (const key of allowedNumbers) {
      if (body[key] !== undefined) {
        const val = Number(body[key]);
        updates[key] = Number.isFinite(val) ? val : 0;
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("webinars")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, webinar: data });
  } catch (e: any) {
    console.error("[webinars/[id]] PATCH error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("webinars")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[webinars/[id]] DELETE error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
