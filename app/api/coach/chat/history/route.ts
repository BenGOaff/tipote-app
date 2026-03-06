// app/api/coach/chat/history/route.ts
// Returns past coach conversations grouped by day.
// GET /api/coach/chat/history?page=0&limit=7
// Returns: { ok: true, days: [{ date: "2026-03-05", messages: [...] }, ...] }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
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

    const url = new URL(req.url);
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? 7) || 7));

    // Exclude today's messages (they're shown in the main chat)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    let query = supabase
      .from("coach_messages")
      .select("id, role, content, summary_tags, created_at")
      .eq("user_id", user.id)
      .lt("created_at", todayIso);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(page * limit * 10, (page + 1) * limit * 10 - 1); // Approximate: fetch enough rows to fill `limit` days

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = data ?? [];

    // Group by day
    const dayMap = new Map<string, typeof rows>();
    for (const row of rows) {
      const day = (row.created_at ?? "").slice(0, 10);
      if (!day) continue;
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(row);
    }

    // Sort days descending, take `limit`
    const sortedDays = Array.from(dayMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit);

    const days = sortedDays.map(([date, msgs]) => ({
      date,
      messages: msgs.reverse(), // chronological within each day
    }));

    const hasMore = dayMap.size > limit;

    return NextResponse.json({ ok: true, days, hasMore }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
