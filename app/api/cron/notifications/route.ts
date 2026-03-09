// GET /api/cron/notifications
// Cron endpoint (called daily by n8n or Vercel cron) to generate automatic notifications:
// 1. Content reminders: manual posts scheduled for today
// 2. Stats reminders: J-1 before end of month, if user hasn't filled stats
// 3. Strategy progression: (checked on profile update, not here)
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Also allow cron secret via query param
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get("secret") ?? "";

  if ((!token || token !== INTERNAL_KEY) && (!cronSecret || cronSecret !== INTERNAL_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const results: string[] = [];

  // ─── 1. Content reminders: posts scheduled for today that are NOT auto-published ───
  try {
    // Find content items scheduled for today that need manual posting
    // (canal is null or empty = manual post)
    const { data: manualPosts } = await supabaseAdmin
      .from("content_item")
      .select("id, user_id, project_id, titre, title, type, canal, channel")
      .or("statut.eq.draft,statut.eq.planned,status.eq.draft,status.eq.planned")
      .eq("date_planifiee", today);

    if (manualPosts?.length) {
      // Deduplicate: one notification per user for all their posts due today
      const byUser = new Map<string, typeof manualPosts>();
      for (const post of manualPosts) {
        const uid = post.user_id;
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid)!.push(post);
      }

      for (const [userId, posts] of byUser) {
        if (posts.length === 1) {
          const p = posts[0];
          const postTitle = p.titre || p.title || "contenu";
          const postType = p.type || "contenu";
          await createNotification({
            user_id: userId,
            project_id: p.project_id,
            type: "content_reminder",
            title: `N'oublie pas de poster ton ${postType} "${postTitle}" aujourd'hui !`,
            icon: "📝",
            action_url: "/contents",
            action_label: "Mes contenus",
          });
        } else {
          await createNotification({
            user_id: userId,
            type: "content_reminder",
            title: `${posts.length} contenus sont prêts à être postés aujourd'hui !`,
            icon: "🔥",
            action_url: "/contents",
            action_label: "Mes contenus",
          });
        }
      }
      results.push(`content_reminders: ${manualPosts.length} posts, ${byUser.size} users`);
    }
  } catch (e) {
    results.push(`content_reminders: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 2. Stats reminders: J-1 before end of month ───
  try {
    const todayDate = new Date(today);
    const lastDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
    const isJMinus1 = todayDate.getDate() === lastDayOfMonth - 1;

    if (isJMinus1) {
      const monthStart = `${today.slice(0, 7)}-01`; // YYYY-MM-01

      // Find users who have NOT filled stats this month
      const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
      const { data: usersWithStats } = await supabaseAdmin
        .from("offer_metrics")
        .select("user_id")
        .eq("month", monthStart);

      const usersWithStatsSet = new Set((usersWithStats ?? []).map((r) => r.user_id));
      const usersWithout = (allUsers?.users ?? []).filter((u) => !usersWithStatsSet.has(u.id));

      for (const u of usersWithout) {
        await createNotification({
          user_id: u.id,
          type: "stats_reminder",
          title: "Tu n'as pas rempli tes statistiques ce mois-ci !",
          body: "Tes stats aident l'IA à mieux te coacher. Remplis-les avant la fin du mois.",
          icon: "📊",
          action_url: "/analytics",
          action_label: "Mes statistiques",
        });
      }
      results.push(`stats_reminders: ${usersWithout.length} users notified`);
    } else {
      results.push("stats_reminders: not J-1, skipped");
    }
  } catch (e) {
    results.push(`stats_reminders: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  return NextResponse.json({ ok: true, today, results });
}
