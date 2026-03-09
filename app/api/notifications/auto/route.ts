// POST /api/notifications/auto
// Internal endpoint to create automatic notifications
// Called by n8n cron, publishing webhooks, or server-side logic
// Body: { user_id, type, title, body?, icon?, action_url?, action_label?, project_id?, meta? }
// Auth: requires service role key OR admin session

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  // Auth: check for internal key in Authorization header
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token || token !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.user_id || !body?.type || !body?.title) {
    return NextResponse.json({ error: "Missing required fields: user_id, type, title" }, { status: 400 });
  }

  const { user_id, type, title, body: notifBody, icon, action_url, action_label, project_id, meta } = body;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id,
    project_id: project_id ?? null,
    type,
    title,
    body: notifBody ?? null,
    icon: icon ?? null,
    action_url: action_url ?? null,
    action_label: action_label ?? null,
    meta: meta ?? {},
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
