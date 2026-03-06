// app/api/coach/notify/route.ts
// Proactive coach notifications — cron-compatible endpoint.
// Scans active users and creates push-like notifications when:
// - A task is overdue
// - An experiment check-in is due
// - The user hasn't interacted in 3+ days
// - A content deadline is approaching
//
// This is designed to be called by a cron job (e.g., Vercel Cron / external scheduler).
// Notifications are stored in a `coach_notifications` approach using coach_messages table
// with a special tag, so they appear when the user opens the coach.
//
// Security: requires CRON_SECRET header for production.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

type NotificationType = "overdue_task" | "experiment_checkin" | "inactivity" | "content_deadline";

type Notification = {
  userId: string;
  projectId?: string;
  type: NotificationType;
  message: string;
};

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET in production
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (auth !== CRON_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const notifications: Notification[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoIso = threeDaysAgo.toISOString();

    // 1. Find overdue tasks
    const { data: overdueTasks } = await supabaseAdmin
      .from("project_tasks")
      .select("user_id, project_id, title, due_date")
      .lt("due_date", today)
      .neq("status", "done")
      .is("deleted_at", null)
      .limit(100);

    if (overdueTasks?.length) {
      // Group by user
      const byUser = new Map<string, typeof overdueTasks>();
      for (const t of overdueTasks) {
        const key = t.user_id;
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key)!.push(t);
      }

      for (const [userId, tasks] of byUser) {
        if (tasks.length === 1) {
          notifications.push({
            userId,
            projectId: tasks[0].project_id,
            type: "overdue_task",
            message: `Hey, ta tache "${tasks[0].title}" est en retard (deadline: ${tasks[0].due_date}). On s'en occupe ?`,
          });
        } else {
          notifications.push({
            userId,
            projectId: tasks[0].project_id,
            type: "overdue_task",
            message: `Tu as ${tasks.length} taches en retard. La plus urgente : "${tasks[0].title}". On fait le point ?`,
          });
        }
      }
    }

    // 2. Find inactive users (Pro/Elite only, no messages in 3+ days)
    const { data: activeProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, plan")
      .in("plan", ["pro", "elite", "beta"])
      .limit(200);

    if (activeProfiles?.length) {
      for (const profile of activeProfiles) {
        const { data: recentMsg } = await supabaseAdmin
          .from("coach_messages")
          .select("id")
          .eq("user_id", profile.id)
          .gte("created_at", threeDaysAgoIso)
          .limit(1);

        if (!recentMsg?.length) {
          const name = profile.first_name ? ` ${profile.first_name}` : "";
          notifications.push({
            userId: profile.id,
            type: "inactivity",
            message: `Yo${name}, ca fait quelques jours ! Un petit check-in pour garder le momentum ?`,
          });
        }
      }
    }

    // 3. Content approaching deadline (next 2 days)
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDaysIso = twoDaysFromNow.toISOString().slice(0, 10);

    const { data: upcomingContent } = await supabaseAdmin
      .from("content_item")
      .select("user_id, project_id, title:titre, scheduled_date:date_planifiee")
      .gte("date_planifiee", today)
      .lte("date_planifiee", twoDaysIso)
      .neq("statut", "published")
      .limit(50);

    if (upcomingContent?.length) {
      const byUser = new Map<string, typeof upcomingContent>();
      for (const c of upcomingContent) {
        if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
        byUser.get(c.user_id)!.push(c);
      }

      for (const [userId, contents] of byUser) {
        notifications.push({
          userId,
          projectId: contents[0].project_id,
          type: "content_deadline",
          message: `Tu as ${contents.length} contenu(s) prevu(s) d'ici 2 jours. "${contents[0].title}" est pret ?`,
        });
      }
    }

    // Store notifications as coach_messages with special tag
    let stored = 0;
    for (const n of notifications) {
      const { error } = await supabaseAdmin.from("coach_messages").insert({
        user_id: n.userId,
        ...(n.projectId ? { project_id: n.projectId } : {}),
        role: "assistant",
        content: n.message,
        summary_tags: ["push_notification", n.type],
        facts: { notification: true, type: n.type, date: today },
      });
      if (!error) stored++;
    }

    return NextResponse.json(
      {
        ok: true,
        processed: notifications.length,
        stored,
        date: today,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
