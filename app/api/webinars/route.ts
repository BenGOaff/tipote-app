// app/api/webinars/route.ts
// GET  — list webinars for active project
// POST — create a new webinar

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
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

    let query = supabase
      .from("webinars")
      .select("*")
      .eq("user_id", user.id)
      .order("webinar_date", { ascending: false, nullsFirst: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, webinars: data ?? [] });
  } catch (e: any) {
    console.error("[webinars] GET error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
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

    const body = await req.json().catch(() => null);
    if (!body?.title?.trim()) {
      return NextResponse.json({ ok: false, error: "Le titre est requis." }, { status: 400 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    const eventType = body.event_type === "challenge" ? "challenge" : "webinar";

    const { data, error } = await supabase
      .from("webinars")
      .insert({
        user_id: user.id,
        project_id: projectId ?? null,
        title: body.title.trim(),
        topic: body.topic?.trim() || null,
        offer_name: body.offer_name?.trim() || null,
        // offer_id must be a valid UUID — synthetic IDs like "user:xxx:0" from loadAllOffers are rejected
        offer_id: body.offer_id && UUID_RE.test(body.offer_id) ? body.offer_id : null,
        webinar_date: body.webinar_date || null,
        end_date: body.end_date || null,
        event_type: eventType,
        program: body.program?.trim() || null,
        status: body.status || "draft",
        notes: body.notes?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, webinar: data }, { status: 201 });
  } catch (e: any) {
    console.error("[webinars] POST error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
