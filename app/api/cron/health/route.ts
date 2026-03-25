// GET /api/cron/health
// Daily cron: system health check + self-healing + admin alerts via email.
// Monitors: stuck posts, expired connections, failed publishes, stale crons.
// Self-heals what it can, alerts admin for what it can't.
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || process.env.SUPPORT_FROM_EMAIL || "hello@tipote.com";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get("secret") ?? "";

  if ((!token || token !== INTERNAL_KEY) && (!cronSecret || cronSecret !== INTERNAL_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const issues: string[] = [];
  const healed: string[] = [];
  const now = new Date();

  // ─── 1. Stuck posts in "publishing" for > 15 minutes ───
  try {
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const { data: stuck } = await supabaseAdmin
      .from("content_item")
      .select("id, user_id, titre, title, status, statut, updated_at")
      .or("status.eq.publishing,statut.eq.publishing")
      .lt("updated_at", fifteenMinAgo);

    if (stuck?.length) {
      // Self-heal: reset to scheduled
      for (const post of stuck) {
        await supabaseAdmin
          .from("content_item")
          .update({ status: "scheduled", statut: "scheduled" } as any)
          .eq("id", post.id);
      }
      healed.push(`${stuck.length} post(s) stuck in "publishing" → reset to "scheduled"`);
    }
  } catch (e) {
    issues.push(`stuck_posts check failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 2. Posts that failed 5+ times (permanently failed) ───
  try {
    const { data: failed } = await supabaseAdmin
      .from("content_item")
      .select("id, user_id, titre, title, meta")
      .or("status.eq.failed,statut.eq.failed");

    if (failed?.length) {
      issues.push(`${failed.length} post(s) permanently failed (5+ retries)`);
    }
  } catch (e) {
    issues.push(`failed_posts check failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 3. Social connections expired ───
  try {
    const { data: expired } = await supabaseAdmin
      .from("social_connections")
      .select("id, user_id, platform, token_expires_at")
      .lt("token_expires_at", now.toISOString());

    if (expired?.length) {
      // Group by platform for summary
      const byPlatform: Record<string, number> = {};
      for (const conn of expired) {
        byPlatform[conn.platform] = (byPlatform[conn.platform] || 0) + 1;
      }
      const summary = Object.entries(byPlatform).map(([p, c]) => `${p}: ${c}`).join(", ");
      issues.push(`${expired.length} expired social connection(s): ${summary}`);
    }
  } catch (e) {
    issues.push(`expired_connections check failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 4. Users with 0 credits (depleted) ───
  try {
    const { data: allCredits } = await supabaseAdmin
      .from("user_credits")
      .select("user_id, monthly_credits_total, monthly_credits_used, bonus_credits_total, bonus_credits_used");

    let depleted = 0;
    for (const row of allCredits ?? []) {
      const mr = Math.max(0, (row.monthly_credits_total ?? 0) - (row.monthly_credits_used ?? 0));
      const br = Math.max(0, (row.bonus_credits_total ?? 0) - (row.bonus_credits_used ?? 0));
      if (mr + br === 0) depleted++;
    }
    if (depleted > 0) {
      issues.push(`${depleted} user(s) with 0 credits remaining`);
    }
  } catch (e) {
    issues.push(`credits check failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 5. Posts scheduled for today that weren't published ───
  try {
    const todayStr = now.toISOString().slice(0, 10);
    const { data: missed } = await supabaseAdmin
      .from("content_item")
      .select("id, user_id, titre, title")
      .or("status.eq.scheduled,statut.eq.scheduled,status.eq.draft,statut.eq.draft")
      .or(`date_planifiee.eq.${todayStr},scheduled_date.eq.${todayStr}`);

    // Only flag posts scheduled for earlier today (past hours)
    const currentHour = now.getHours();
    if (currentHour >= 18 && missed?.length) {
      issues.push(`${missed.length} post(s) scheduled for today still not published at ${currentHour}h`);
    }
  } catch { /* ignore — columns might not exist */ }

  // ─── Send admin alert if there are issues ───
  if (issues.length > 0 || healed.length > 0) {
    const bodyParts: string[] = [];

    if (healed.length > 0) {
      bodyParts.push(`<strong>Auto-réparations :</strong><br/>${healed.map((h) => `✅ ${h}`).join("<br/>")}`);
    }

    if (issues.length > 0) {
      bodyParts.push(`<strong>Problèmes détectés :</strong><br/>${issues.map((i) => `⚠️ ${i}`).join("<br/>")}`);
    }

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🔍 Tipote Health — ${issues.length} issue(s), ${healed.length} healed`,
      greeting: "Rapport de santé Tipote",
      body: bodyParts.join("<br/><br/>"),
      ctaLabel: "Ouvrir l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com"}/admin`,
      locale: "fr",
      preheader: issues.length > 0 ? `${issues.length} problème(s) détecté(s)` : "Tout est OK",
      category: "health_check",
    });
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    issues,
    healed,
    healthy: issues.length === 0,
  });
}
