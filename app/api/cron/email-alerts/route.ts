// GET /api/cron/email-alerts
// Daily cron: send urgent email alerts via Resend
// 1. Social connections expired → "Reconnecte ton compte"
// 2. Credits depleted (0 remaining) → "Tes crédits sont épuisés"
// Respects email_preferences (opt-out per user)
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, canSendEmailToday } from "@/lib/email";

const INTERNAL_KEY = process.env.NOTIFICATIONS_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Platform display names
const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X (Twitter)",
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
  const results: string[] = [];

  // ─── 1. Social connections expired ───
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabaseAdmin
      .from("social_connections")
      .select("id, user_id, platform, token_expires_at")
      .lt("token_expires_at", now);

    if (expired?.length) {
      // Group by user
      const byUser = new Map<string, typeof expired>();
      for (const conn of expired) {
        if (!byUser.has(conn.user_id)) byUser.set(conn.user_id, []);
        byUser.get(conn.user_id)!.push(conn);
      }

      let sent = 0;
      for (const [userId, conns] of byUser) {
        // Check email preferences
        const { data: prefs } = await supabaseAdmin
          .from("email_preferences")
          .select("social_alerts")
          .eq("user_id", userId)
          .maybeSingle();

        if (prefs && prefs.social_alerts === false) continue;

        // Check we haven't sent this email in the last 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentNotif } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "social_expiring")
          .gte("created_at", threeDaysAgo)
          .not("meta->email_sent", "is", null)
          .limit(1);

        if (recentNotif?.length) continue;

        // Global daily rate limit
        if (!(await canSendEmailToday(userId, supabaseAdmin))) continue;

        // Get user email
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (!user?.email) continue;

        // Get user locale + name
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, content_locale")
          .eq("id", userId)
          .maybeSingle();

        const locale = profile?.content_locale || "fr";
        const name = profile?.first_name || "";
        const platforms = conns.map((c) => PLATFORM_NAMES[c.platform] || c.platform);

        const greeting = name ? `${name},` : (locale === "fr" ? "Bonjour," : "Hello,");
        const platformList = platforms.join(", ");

        const subjects: Record<string, string> = {
          fr: `⚠️ Reconnecte ${platformList} sur Tipote`,
          en: `⚠️ Reconnect ${platformList} on Tipote`,
          es: `⚠️ Reconecta ${platformList} en Tipote`,
          it: `⚠️ Riconnetti ${platformList} su Tipote`,
        };

        const bodies: Record<string, string> = {
          fr: `Ta connexion ${platformList} a expiré.<br/><br/>Tes publications programmées ne seront pas envoyées tant que tu ne te reconnectes pas.<br/><br/>Ça prend 30 secondes dans tes paramètres.`,
          en: `Your ${platformList} connection has expired.<br/><br/>Your scheduled posts won't be sent until you reconnect.<br/><br/>It takes 30 seconds in your settings.`,
          es: `Tu conexión con ${platformList} ha expirado.<br/><br/>Tus publicaciones programadas no se enviarán hasta que te reconectes.`,
          it: `La tua connessione ${platformList} è scaduta.<br/><br/>I post programmati non verranno inviati finché non ti riconnetti.`,
        };

        const ctaLabels: Record<string, string> = {
          fr: "Reconnecter maintenant",
          en: "Reconnect now",
          es: "Reconectar ahora",
          it: "Riconnetti ora",
        };

        await sendEmail({
          to: user.email,
          subject: subjects[locale] || subjects.fr,
          greeting,
          body: bodies[locale] || bodies.fr,
          ctaLabel: ctaLabels[locale] || ctaLabels.fr,
          ctaUrl: `${appUrl}/settings?tab=connections`,
          locale,
        });

        // Track that we sent the email (via notification meta)
        await supabaseAdmin.from("notifications").insert({
          user_id: userId,
          type: "social_expiring",
          title: `Email envoyé : reconnecte ${platformList}`,
          icon: "📧",
          meta: { email_sent: true, platforms: conns.map((c) => c.platform) },
        });

        sent++;
      }
      results.push(`social_expired_emails: ${expired.length} connections, ${sent} emails sent`);
    } else {
      results.push("social_expired_emails: none");
    }
  } catch (e) {
    results.push(`social_expired_emails: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 2. Credits depleted (0 remaining) ───
  try {
    const { data: allCredits } = await supabaseAdmin
      .from("user_credits")
      .select("user_id, monthly_credits_total, monthly_credits_used, bonus_credits_total, bonus_credits_used");

    const depletedUsers: string[] = [];
    for (const row of allCredits ?? []) {
      const monthlyRem = Math.max(0, (row.monthly_credits_total ?? 0) - (row.monthly_credits_used ?? 0));
      const bonusRem = Math.max(0, (row.bonus_credits_total ?? 0) - (row.bonus_credits_used ?? 0));
      if (monthlyRem + bonusRem === 0) {
        depletedUsers.push(row.user_id);
      }
    }

    let sent = 0;
    for (const userId of depletedUsers) {
      // Check email preferences
      const { data: prefs } = await supabaseAdmin
        .from("email_preferences")
        .select("credits_alerts")
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs && prefs.credits_alerts === false) continue;

      // Max 1 email per monthly reset period (don't spam)
      const { data: creditRow } = await supabaseAdmin
        .from("user_credits")
        .select("monthly_reset_at")
        .eq("user_id", userId)
        .maybeSingle();

      const resetAt = creditRow?.monthly_reset_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentEmail } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "credits_depleted_email")
        .gte("created_at", resetAt)
        .limit(1);

      if (recentEmail?.length) continue;

      // Global daily rate limit
      if (!(await canSendEmailToday(userId, supabaseAdmin))) continue;

      // Get user info
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!user?.email) continue;

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, content_locale")
        .eq("id", userId)
        .maybeSingle();

      const locale = profile?.content_locale || "fr";
      const name = profile?.first_name || "";
      const greeting = name ? `${name},` : (locale === "fr" ? "Bonjour," : "Hello,");

      const subjects: Record<string, string> = {
        fr: "⚡ Tes crédits IA Tipote sont épuisés",
        en: "⚡ Your Tipote AI credits are depleted",
        es: "⚡ Tus créditos IA de Tipote se agotaron",
        it: "⚡ I tuoi crediti IA Tipote sono esauriti",
      };

      const bodies: Record<string, string> = {
        fr: "Tu as utilisé tous tes crédits IA ce mois-ci.<br/><br/>Tu ne pourras plus générer de contenus, stratégies ou analyses tant que tes crédits ne sont pas rechargés.<br/><br/>Tu peux acheter un pack de crédits supplémentaires ou attendre le renouvellement mensuel.",
        en: "You've used all your AI credits this month.<br/><br/>You won't be able to generate content, strategies, or analyses until your credits are recharged.<br/><br/>You can buy an extra credits pack or wait for the monthly renewal.",
        es: "Has utilizado todos tus créditos IA este mes.<br/><br/>No podrás generar contenidos hasta que recargues tus créditos.",
        it: "Hai utilizzato tutti i tuoi crediti IA questo mese.<br/><br/>Non potrai generare contenuti finché non ricarichi i crediti.",
      };

      const ctaLabels: Record<string, string> = {
        fr: "Recharger mes crédits",
        en: "Recharge my credits",
        es: "Recargar mis créditos",
        it: "Ricarica i crediti",
      };

      await sendEmail({
        to: user.email,
        subject: subjects[locale] || subjects.fr,
        greeting,
        body: bodies[locale] || bodies.fr,
        ctaLabel: ctaLabels[locale] || ctaLabels.fr,
        ctaUrl: `${appUrl}/settings?tab=pricing`,
        locale,
      });

      // Track
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "credits_depleted_email",
        title: "Email envoyé : crédits épuisés",
        icon: "📧",
        meta: { email_sent: true },
      });

      sent++;
    }
    results.push(`credits_depleted_emails: ${depletedUsers.length} users depleted, ${sent} emails sent`);
  } catch (e) {
    results.push(`credits_depleted_emails: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  // ─── 3. Systeme.io API key invalid/expired ───
  // Users who have a SIO key configured: test it periodically.
  // If it fails (401/403), send an alert so they can re-enter it before losing leads.
  try {
    const { data: profiles } = await supabaseAdmin
      .from("business_profiles")
      .select("user_id, project_id, sio_user_api_key")
      .not("sio_user_api_key", "is", null)
      .neq("sio_user_api_key", "");

    const uniqueUsers = new Map<string, { apiKey: string; projectId: string | null }>();
    for (const p of profiles ?? []) {
      const key = String(p.sio_user_api_key ?? "").trim();
      if (key && !uniqueUsers.has(p.user_id)) {
        uniqueUsers.set(p.user_id, { apiKey: key, projectId: p.project_id });
      }
    }

    let sioSent = 0;
    for (const [userId, { apiKey }] of uniqueUsers) {
      // Quick health check: try listing tags (lightweight endpoint)
      try {
        const check = await fetch("https://api.systeme.io/api/tags?limit=1", {
          headers: { "X-API-Key": apiKey, Accept: "application/json" },
        });

        // Key is valid — skip
        if (check.ok) continue;
        // Only alert on auth failures (401/403), not transient errors
        if (check.status !== 401 && check.status !== 403) continue;
      } catch {
        // Network error — don't alert (transient)
        continue;
      }

      // Check email preferences
      const { data: prefs } = await supabaseAdmin
        .from("email_preferences")
        .select("social_alerts")
        .eq("user_id", userId)
        .maybeSingle();
      // Reuse social_alerts preference (integration alerts)
      if (prefs && prefs.social_alerts === false) continue;

      // Max 1 alert per 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentNotif } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "sio_key_invalid")
        .gte("created_at", threeDaysAgo)
        .limit(1);
      if (recentNotif?.length) continue;

      // Daily rate limit
      if (!(await canSendEmailToday(userId, supabaseAdmin))) continue;

      // Get user email + locale
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!user?.email) continue;

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, content_locale")
        .eq("id", userId)
        .maybeSingle();

      const locale = profile?.content_locale || "fr";
      const name = profile?.first_name || "";
      const greeting = name ? `${name},` : (locale === "fr" ? "Bonjour," : "Hello,");

      const subjects: Record<string, string> = {
        fr: "🔑 Ta clé API Systeme.io ne fonctionne plus",
        en: "🔑 Your Systeme.io API key is no longer working",
        es: "🔑 Tu clave API de Systeme.io ya no funciona",
        it: "🔑 La tua chiave API Systeme.io non funziona più",
      };

      const bodies: Record<string, string> = {
        fr: "Ta clé API Systeme.io enregistrée dans Tipote a expiré ou a été révoquée.<br/><br/><strong>Tes quiz continuent de capturer les emails</strong>, mais les contacts ne sont plus transmis à ton compte Systeme.io tant que la clé n'est pas mise à jour.<br/><br/>Va dans tes réglages pour coller ta nouvelle clé API — ça prend 30 secondes.",
        en: "The Systeme.io API key stored in Tipote has expired or been revoked.<br/><br/><strong>Your quizzes still capture emails</strong>, but contacts are no longer synced to your Systeme.io account until the key is updated.<br/><br/>Go to your settings to paste your new API key — it takes 30 seconds.",
        es: "Tu clave API de Systeme.io registrada en Tipote ha expirado o fue revocada.<br/><br/><strong>Tus quizzes siguen capturando emails</strong>, pero los contactos ya no se sincronizan con tu cuenta Systeme.io.<br/><br/>Ve a tus ajustes para pegar tu nueva clave API.",
        it: "La tua chiave API Systeme.io registrata in Tipote è scaduta o è stata revocata.<br/><br/><strong>I tuoi quiz continuano a catturare le email</strong>, ma i contatti non vengono più sincronizzati con il tuo account Systeme.io.<br/><br/>Vai nelle impostazioni per incollare la nuova chiave API.",
      };

      const ctaLabels: Record<string, string> = {
        fr: "Mettre à jour ma clé API",
        en: "Update my API key",
        es: "Actualizar mi clave API",
        it: "Aggiorna la mia chiave API",
      };

      await sendEmail({
        to: user.email,
        subject: subjects[locale] || subjects.fr,
        greeting,
        body: bodies[locale] || bodies.fr,
        ctaLabel: ctaLabels[locale] || ctaLabels.fr,
        ctaUrl: `${appUrl}/settings?tab=integrations`,
        locale,
        preheader: locale === "fr"
          ? "Les leads de tes quiz ne sont plus transmis à Systeme.io"
          : "Your quiz leads are no longer syncing to Systeme.io",
      });

      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "sio_key_invalid",
        title: locale === "fr" ? "Clé API Systeme.io invalide" : "Systeme.io API key invalid",
        icon: "🔑",
        action_url: "/settings?tab=integrations",
        action_label: ctaLabels[locale] || ctaLabels.fr,
        meta: { email_sent: true },
      });

      sioSent++;
    }
    results.push(`sio_key_alerts: ${uniqueUsers.size} users with keys, ${sioSent} alerts sent`);
  } catch (e) {
    results.push(`sio_key_alerts: error - ${e instanceof Error ? e.message : "unknown"}`);
  }

  return NextResponse.json({ ok: true, results });
}
