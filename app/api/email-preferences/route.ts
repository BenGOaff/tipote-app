// GET  : fetch current user's email preferences
// PATCH: update email preferences (partial update)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const FIELDS = ["social_alerts", "credits_alerts", "weekly_digest", "monthly_report", "milestone_emails"] as const;

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("email_preferences")
    .select("social_alerts, credits_alerts, weekly_digest, monthly_report, milestone_emails")
    .eq("user_id", user.id)
    .maybeSingle();

  // Return defaults if no row yet
  return NextResponse.json({
    social_alerts: data?.social_alerts ?? true,
    credits_alerts: data?.credits_alerts ?? true,
    weekly_digest: data?.weekly_digest ?? true,
    monthly_report: data?.monthly_report ?? true,
    milestone_emails: data?.milestone_emails ?? true,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Only accept known boolean fields
  const updates: Record<string, boolean> = {};
  for (const field of FIELDS) {
    if (typeof body[field] === "boolean") {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Upsert: create row if not exists, update if exists
  const { error } = await supabase
    .from("email_preferences")
    .upsert(
      { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[email-preferences] upsert error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...updates });
}
