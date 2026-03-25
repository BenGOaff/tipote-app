// GET /api/cron/weekly-digest
// Weekly cron (Monday morning): sends a recap email to users who opted in.
// Includes: posts published this week, credits remaining, upcoming events, expired connections.
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  threads: "Threads",
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get("secret") ?? "";

  if ((!token || token !== INTERNAL_KEY) && (!cronSecret || cronSecret !== INTERNAL_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  // Get all users
  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
  if (!allUsers?.users?.length) {
    return NextResponse.json({ ok: true, results: ["no users"] });
  }

  let sent = 0;
  let skipped = 0;

  for (const user of allUsers.users) {
    if (!user.email) continue;

    // Check email preferences (default: true)
    const { data: prefs } = await supabaseAdmin
      .from("email_preferences")
      .select("weekly_digest")
      .eq("user_id", user.id)
      .maybeSingle();

    if (prefs && prefs.weekly_digest === false) {
      skipped++;
      continue;
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, content_locale")
      .eq("id", user.id)
      .maybeSingle();

    const locale = profile?.content_locale || "fr";
    const name = profile?.first_name || "";

    // ── Gather data ──

    // 1. Posts published this week
    const { data: publishedPosts } = await supabaseAdmin
      .from("content_item")
      .select("id, titre, title, type")
      .eq("user_id", user.id)
      .or("statut.eq.published,status.eq.published")
      .gte("updated_at", weekAgo);

    const publishedCount = publishedPosts?.length ?? 0;

    // 2. Credits remaining
    let creditsRemaining = -1;
    try {
      const { data: snap } = await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: user.id });
      if (snap) {
        const mr = Math.max(0, (snap.monthly_credits_total ?? 0) - (snap.monthly_credits_used ?? 0));
        const br = Math.max(0, (snap.bonus_credits_total ?? 0) - (snap.bonus_credits_used ?? 0));
        creditsRemaining = mr + br;
      }
    } catch { /* ignore */ }

    // 3. Upcoming events (next 7 days)
    const { data: upcomingEvents } = await supabaseAdmin
      .from("webinars")
      .select("id, title, event_type, start_date")
      .eq("user_id", user.id)
      .gte("start_date", today)
      .lte("start_date", in7Days);

    // 4. Expired social connections
    const { data: expiredConns } = await supabaseAdmin
      .from("social_connections")
      .select("platform")
      .eq("user_id", user.id)
      .lt("token_expires_at", now.toISOString());

    // 5. Leads captured this week
    const { count: leadsCount } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", weekAgo);

    // 6. Tasks completed this week
    const { count: tasksCount } = await supabaseAdmin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "done")
      .gte("updated_at", weekAgo);

    // ── Skip if nothing to report ──
    if (publishedCount === 0 && (upcomingEvents?.length ?? 0) === 0 && (expiredConns?.length ?? 0) === 0 && (leadsCount ?? 0) === 0 && (tasksCount ?? 0) === 0 && creditsRemaining > 10) {
      skipped++;
      continue;
    }

    // ── Build email body ──
    const sections: string[] = [];

    // Posts
    if (locale === "fr") {
      if (publishedCount > 0) {
        const titles = (publishedPosts ?? []).slice(0, 5).map((p) => p.titre || p.title || "contenu").join(", ");
        sections.push(`<strong>📝 ${publishedCount} contenu${publishedCount > 1 ? "s" : ""} publié${publishedCount > 1 ? "s" : ""}</strong><br/>${titles}${publishedCount > 5 ? "..." : ""}`);
      } else {
        sections.push("<strong>📝 Aucun contenu publié cette semaine</strong><br/>Prépare tes prochains posts pour rester visible !");
      }
    } else {
      if (publishedCount > 0) {
        sections.push(`<strong>📝 ${publishedCount} post${publishedCount > 1 ? "s" : ""} published</strong>`);
      } else {
        sections.push("<strong>📝 No content published this week</strong><br/>Prepare your next posts to stay visible!");
      }
    }

    // Credits
    if (creditsRemaining >= 0) {
      const creditsIcon = creditsRemaining <= 5 ? "🔴" : creditsRemaining <= 15 ? "🟡" : "🟢";
      if (locale === "fr") {
        sections.push(`<strong>${creditsIcon} ${creditsRemaining} crédit${creditsRemaining > 1 ? "s" : ""} IA restant${creditsRemaining > 1 ? "s" : ""}</strong>`);
      } else {
        sections.push(`<strong>${creditsIcon} ${creditsRemaining} AI credit${creditsRemaining > 1 ? "s" : ""} remaining</strong>`);
      }
    }

    // Upcoming events
    if (upcomingEvents?.length) {
      const evList = upcomingEvents.map((e) => `• ${e.title} (${e.start_date})`).join("<br/>");
      if (locale === "fr") {
        sections.push(`<strong>🎯 ${upcomingEvents.length} événement${upcomingEvents.length > 1 ? "s" : ""} cette semaine</strong><br/>${evList}`);
      } else {
        sections.push(`<strong>🎯 ${upcomingEvents.length} event${upcomingEvents.length > 1 ? "s" : ""} this week</strong><br/>${evList}`);
      }
    }

    // Leads captured
    if ((leadsCount ?? 0) > 0) {
      if (locale === "fr") {
        sections.push(`<strong>🎯 ${leadsCount} lead${(leadsCount ?? 0) > 1 ? "s" : ""} capturé${(leadsCount ?? 0) > 1 ? "s" : ""}</strong>`);
      } else {
        sections.push(`<strong>🎯 ${leadsCount} lead${(leadsCount ?? 0) > 1 ? "s" : ""} captured</strong>`);
      }
    }

    // Tasks completed
    if ((tasksCount ?? 0) > 0) {
      if (locale === "fr") {
        sections.push(`<strong>✅ ${tasksCount} tâche${(tasksCount ?? 0) > 1 ? "s" : ""} terminée${(tasksCount ?? 0) > 1 ? "s" : ""}</strong>`);
      } else {
        sections.push(`<strong>✅ ${tasksCount} task${(tasksCount ?? 0) > 1 ? "s" : ""} completed</strong>`);
      }
    }

    // Expired connections
    if (expiredConns?.length) {
      const platforms = expiredConns.map((c) => PLATFORM_NAMES[c.platform] || c.platform).join(", ");
      if (locale === "fr") {
        sections.push(`<strong>⚠️ Connexion${expiredConns.length > 1 ? "s" : ""} expirée${expiredConns.length > 1 ? "s" : ""} : ${platforms}</strong><br/>Reconnecte-${expiredConns.length > 1 ? "les" : "la"} pour ne pas rater tes publications.`);
      } else {
        sections.push(`<strong>⚠️ Expired connection${expiredConns.length > 1 ? "s" : ""}: ${platforms}</strong><br/>Reconnect to keep your scheduled posts going.`);
      }
    }

    const body = sections.join("<br/><br/>");

    const greeting = name ? `${name},` : (locale === "fr" ? "Bonjour," : "Hello,");

    const subjects: Record<string, string> = {
      fr: `📊 Ton récap Tipote de la semaine`,
      en: `📊 Your Tipote weekly recap`,
      es: `📊 Tu resumen semanal de Tipote`,
      it: `📊 Il tuo riepilogo settimanale Tipote`,
    };

    const ctaLabels: Record<string, string> = {
      fr: "Ouvrir Tipote",
      en: "Open Tipote",
      es: "Abrir Tipote",
      it: "Apri Tipote",
    };

    await sendEmail({
      to: user.email,
      subject: subjects[locale] || subjects.fr,
      greeting,
      body,
      ctaLabel: ctaLabels[locale] || ctaLabels.fr,
      ctaUrl: `${appUrl}/dashboard`,
      locale,
    });

    sent++;
  }

  return NextResponse.json({
    ok: true,
    results: [`weekly_digest: ${sent} sent, ${skipped} skipped, ${allUsers.users.length} total users`],
  });
}
