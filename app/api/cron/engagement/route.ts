// GET /api/cron/engagement
// Daily cron: behavioral activation nudges + inactivity re-engagement emails.
//
// ACTIVATION NUDGES (new users, first 14 days):
// - Day 2: No social connected → "Connecte ton premier réseau"
// - Day 4: No content created → "Crée ton premier contenu"
// - Day 7: No strategy → "Génère ta stratégie"
//
// INACTIVITY RE-ENGAGEMENT (all users):
// - 7 days inactive → Email "On ne t'a pas vu depuis un moment"
// - 14 days inactive → Email "Ton business t'attend"
//
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";
import { sendEmail, canSendEmailToday } from "@/lib/email";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
  const results: string[] = [];

  // ─── ACTIVATION NUDGES (users who onboarded in last 14 days) ───
  try {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get recently onboarded users
    const { data: recentProfiles } = await supabaseAdmin
      .from("business_profiles")
      .select("user_id, content_locale, first_name, created_at")
      .eq("onboarding_completed", true)
      .gte("created_at", fourteenDaysAgo);

    let nudgesSent = 0;

    for (const profile of recentProfiles ?? []) {
      const userId = profile.user_id;
      const createdAt = new Date(profile.created_at);
      const daysSinceOnboard = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
      const locale = profile.content_locale || "fr";

      // Day 2+: Check social connections
      if (daysSinceOnboard >= 2) {
        const { count: socialCount } = await supabaseAdmin
          .from("social_connections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        if (socialCount === 0) {
          const sent = await sendNudge(userId, "nudge_connect_social", locale, {
            fr: { title: "Connecte ton premier réseau social", body: "Programme tes posts automatiquement. Ça prend 30 secondes." },
            en: { title: "Connect your first social network", body: "Schedule your posts automatically. It takes 30 seconds." },
          }, "🔗", "/settings?tab=connections",
            locale === "fr" ? "Connecter" : "Connect");
          if (sent) nudgesSent++;
        }
      }

      // Day 4+: Check content created
      if (daysSinceOnboard >= 4) {
        const { count: contentCount } = await supabaseAdmin
          .from("content_item")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        if (contentCount === 0) {
          const sent = await sendNudge(userId, "nudge_create_content", locale, {
            fr: { title: "Crée ton premier contenu", body: "L'IA génère posts, emails et pages en quelques clics." },
            en: { title: "Create your first content", body: "AI generates posts, emails and pages in a few clicks." },
          }, "✍️", "/contents",
            locale === "fr" ? "Créer un contenu" : "Create content");
          if (sent) nudgesSent++;
        }
      }

      // Day 7+: Check strategy
      if (daysSinceOnboard >= 7) {
        const { count: stratCount } = await supabaseAdmin
          .from("business_plan")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        if (stratCount === 0) {
          const sent = await sendNudge(userId, "nudge_generate_strategy", locale, {
            fr: { title: "Génère ta stratégie business", body: "L'IA analyse ton profil et crée un plan d'action sur 90 jours." },
            en: { title: "Generate your business strategy", body: "AI analyzes your profile and creates a 90-day action plan." },
          }, "🗺️", "/strategy",
            locale === "fr" ? "Voir la stratégie" : "View strategy");
          if (sent) nudgesSent++;
        }
      }
    }
    results.push(`activation_nudges: ${nudgesSent} sent`);
  } catch (e) {
    results.push(`activation_nudges: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── INACTIVITY RE-ENGAGEMENT EMAILS ───
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get all users
    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
    let emailsSent = 0;

    for (const user of allUsers?.users ?? []) {
      if (!user.email) continue;

      // Use last_sign_in_at as activity proxy
      const lastActive = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
      if (!lastActive) continue;

      const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000));

      // Only trigger at exactly 7 or 14 days (±1 day window)
      let nudgeType: "inactivity_7d" | "inactivity_14d" | null = null;
      if (daysSinceActive >= 7 && daysSinceActive <= 8) nudgeType = "inactivity_7d";
      else if (daysSinceActive >= 14 && daysSinceActive <= 15) nudgeType = "inactivity_14d";

      if (!nudgeType) continue;

      // Check email preferences
      const { data: prefs } = await supabaseAdmin
        .from("email_preferences")
        .select("weekly_digest")
        .eq("user_id", user.id)
        .maybeSingle();

      // Use weekly_digest pref as proxy (users who opt out of digest probably don't want re-engagement)
      if (prefs && prefs.weekly_digest === false) continue;

      // Global daily rate limit
      if (!(await canSendEmailToday(user.id, supabaseAdmin))) continue;

      // Check dedup: max 1 per type per 14-day window
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", nudgeType)
        .gte("created_at", twoWeeksAgo)
        .limit(1);

      if (existing?.length) continue;

      // Get profile
      const { data: profile } = await supabaseAdmin
        .from("business_profiles")
        .select("first_name, content_locale")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const locale = profile?.content_locale || "fr";
      const name = profile?.first_name || "";
      const greeting = name || (locale === "fr" ? "Bonjour" : "Hello");

      if (nudgeType === "inactivity_7d") {
        await sendEmail({
          to: user.email,
          subject: locale === "fr" ? "💡 Des idées t'attendent sur Tipote" : "💡 Ideas are waiting for you on Tipote",
          greeting: `${greeting},`,
          body: locale === "fr"
            ? "Ça fait une semaine qu'on ne t'a pas vu.<br/><br/>Ton espace Tipote est toujours là, prêt à t'aider à avancer. Que ce soit pour créer un contenu, programmer un post ou affiner ta stratégie — tout est à portée de clic."
            : "It's been a week since we last saw you.<br/><br/>Your Tipote workspace is still here, ready to help you move forward. Whether it's creating content, scheduling a post, or refining your strategy — everything is just a click away.",
          ctaLabel: locale === "fr" ? "Revenir sur Tipote" : "Back to Tipote",
          ctaUrl: `${appUrl}/dashboard`,
          locale,
        });
      } else {
        await sendEmail({
          to: user.email,
          subject: locale === "fr" ? "🌟 Ton business t'attend" : "🌟 Your business is waiting",
          greeting: `${greeting},`,
          body: locale === "fr"
            ? "Ça fait 2 semaines.<br/><br/>Tes objectifs sont toujours là. Un petit pas aujourd'hui peut faire une grande différence demain.<br/><br/>Connecte-toi et on t'aide à reprendre là où tu en étais."
            : "It's been 2 weeks.<br/><br/>Your goals are still there. A small step today can make a big difference tomorrow.<br/><br/>Log in and we'll help you pick up where you left off.",
          ctaLabel: locale === "fr" ? "Reprendre maintenant" : "Resume now",
          ctaUrl: `${appUrl}/dashboard`,
          locale,
        });
      }

      // Track
      await supabaseAdmin.from("notifications").insert({
        user_id: user.id,
        type: nudgeType,
        title: nudgeType === "inactivity_7d" ? "Re-engagement J+7" : "Re-engagement J+14",
        icon: "📧",
        meta: { email_sent: true },
      });

      emailsSent++;
    }
    results.push(`inactivity_reengagement: ${emailsSent} emails sent`);
  } catch (e) {
    results.push(`inactivity_reengagement: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  return NextResponse.json({ ok: true, results });
}

// ── Helper: send activation nudge (deduped) ──
async function sendNudge(
  userId: string,
  type: string,
  locale: string,
  texts: Record<string, { title: string; body: string }>,
  icon: string,
  actionUrl: string,
  actionLabel: string,
): Promise<boolean> {
  // Check if already sent
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .limit(1);

  if (existing?.length) return false;

  const t = texts[locale] || texts.fr;
  await createNotification({
    user_id: userId,
    type,
    title: t.title,
    body: t.body,
    icon,
    action_url: actionUrl,
    action_label: actionLabel,
  });
  return true;
}
