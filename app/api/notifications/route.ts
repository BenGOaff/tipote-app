// GET  /api/notifications?tab=unread|all|archived&limit=50&offset=0
// POST /api/notifications  { action: "mark_read" | "mark_unread" | "archive" | "mark_all_read", id?: string }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "unread";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tab === "unread") {
    query = query.is("read_at", null).is("archived_at", null);
  } else if (tab === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    // "all" — everything not archived
    query = query.is("archived_at", null);
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also get counts for badges
  const [unreadRes, allRes, archivedRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("archived_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("archived_at", "is", null),
  ]);

  return NextResponse.json({
    ok: true,
    notifications: data ?? [],
    total: count ?? 0,
    counts: {
      unread: unreadRes.count ?? 0,
      all: allRes.count ?? 0,
      archived: archivedRes.count ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const { action, id } = body;

  if (action === "mark_read" && id) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "mark_unread" && id) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: null })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "archive" && id) {
    const { error } = await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "mark_all_read") {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
