// app/api/leads/route.ts
// GET — list leads with pagination, search, filter
// POST — create a new lead manually

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

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

    const url = req.nextUrl;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
    const search = (url.searchParams.get("q") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "").trim();
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (projectId) query = query.eq("project_id", projectId);
    if (source) query = query.eq("source", source);
    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      leads: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
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
    const body = await req.json();

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        project_id: projectId ?? null,
        email,
        first_name: body.first_name?.trim() || null,
        last_name: body.last_name?.trim() || null,
        phone: body.phone?.trim() || null,
        source: body.source ?? "manual",
        source_id: body.source_id ?? null,
        source_name: body.source_name ?? null,
        quiz_answers: body.quiz_answers ?? null,
        quiz_result_title: body.quiz_result_title ?? null,
        exported_sio: body.exported_sio ?? false,
        meta: body.meta ?? {},
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
