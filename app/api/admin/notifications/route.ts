// POST /api/admin/notifications
// Admin-only: send a notification to all users or specific users
// Body: { title, body?, icon?, action_url?, action_label?, user_ids?: string[] }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const { title, body: notifBody, icon, action_url, action_label, user_ids } = body;

  let targetUserIds: string[] = [];

  if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
    // Send to specific users
    targetUserIds = user_ids;
  } else {
    // Broadcast to ALL users
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targetUserIds = users.users.map((u) => u.id);
  }

  if (!targetUserIds.length) {
    return NextResponse.json({ error: "No target users" }, { status: 400 });
  }

  // Insert notifications in batches of 500
  const rows = targetUserIds.map((uid) => ({
    user_id: uid,
    type: "admin_broadcast",
    title,
    body: notifBody ?? null,
    icon: icon ?? null,
    action_url: action_url ?? null,
    action_label: action_label ?? null,
  }));

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from("notifications").insert(batch);
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted },
        { status: 500 },
      );
    }
    inserted += batch.length;
  }

  return NextResponse.json({ ok: true, inserted });
}
