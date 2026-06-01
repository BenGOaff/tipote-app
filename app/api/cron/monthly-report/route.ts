// GET /api/cron/monthly-report
// Monthly cron (1st of month): "Ton Tipote en chiffres" value report.
// Shows users the concrete value they got from Tipote last month.
// Auth: internal key

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { getWallOfWinsPayload } from "@/lib/wallOfWins/stats";

// Formateur EUR partagé avec le frontend WallOfWins (Intl.NumberFormat
// est créé une fois au module-load = quasi gratuit par appel).
const EUR_FMT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const NUM_FMT = new Intl.NumberFormat("fr-FR");

/**
 * Escape minimal pour insérer un titre user-saisi dans un email HTML
 * (le titre d'un quiz peut contenir des caractères spéciaux qui
 * casseraient le rendu).
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  // Last month range
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const monthStart = lastMonth.toISOString();
  const monthEnd = lastMonthEnd.toISOString();

  const monthNames: Record<string, string[]> = {
    fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  };

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
  let sent = 0;
  let skipped = 0;

  for (const user of allUsers?.users ?? []) {
    if (!user.email) continue;

    // Check email preferences (monthly_report field)
    const { data: prefs } = await supabaseAdmin
      .from("email_preferences")
      .select("monthly_report")
      .eq("user_id", user.id)
      .maybeSingle();

    if (prefs && prefs.monthly_report === false) {
      skipped++;
      continue;
    }

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

    // ── Gather monthly stats ──

    // Posts published
    const { count: publishedCount } = await supabaseAdmin
      .from("content_item")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .or("statut.eq.published,status.eq.published")
      .gte("updated_at", monthStart)
      .lte("updated_at", monthEnd);

    // Leads captured
    const { count: leadsCount } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd);

    // Pages views (if page_clicks table exists)
    let pageViews = 0;
    try {
      const { count } = await supabaseAdmin
        .from("page_clicks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      pageViews = count ?? 0;
    } catch { /* table may not exist */ }

    // AI credits used
    const { data: creditRow } = await supabaseAdmin
      .from("user_credits")
      .select("monthly_credits_used")
      .eq("user_id", user.id)
      .maybeSingle();

    const creditsUsed = creditRow?.monthly_credits_used ?? 0;

    // Tasks completed
    const { count: tasksCompleted } = await supabaseAdmin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "done")
      .gte("updated_at", monthStart)
      .lte("updated_at", monthEnd);

    // ── Wall of Wins extension (phase 2 ROADMAP_RETENTION.md) ──
    // Ajoute les "wins" rétention (ventes / CA / complétions de quiz /
    // partages / top quiz / milestones débloqués) au récap existant.
    // Fenêtre = mois écoulé complet (since=lastMonth, until=1er du mois
    // courant). Ne tient pas compte du projet actif (le cron actuel
    // n'en tient pas compte non plus → agrégation cross-project).
    const winsCutoffStart = lastMonth;
    const winsCutoffEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const winsPayload = await getWallOfWinsPayload({
      userId: user.id,
      projectId: null,
      since: winsCutoffStart,
      until: winsCutoffEnd,
    }).catch(() => null);
    const wins = winsPayload?.current ?? null;
    const winsHasResults = winsPayload?.hasResults === true;

    // Skip if nothing to report (compteurs existants ET wins tous vides).
    if (
      (publishedCount ?? 0) === 0 &&
      (leadsCount ?? 0) === 0 &&
      creditsUsed === 0 &&
      (tasksCompleted ?? 0) === 0 &&
      !winsHasResults
    ) {
      skipped++;
      continue;
    }

    // ── Build email ──
    const mName = (monthNames[locale] || monthNames.fr)[lastMonth.getMonth()];

    const statLines: string[] = [];

    if (locale === "fr") {
      statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">📝</td><td style="padding:8px 16px;"><strong>${publishedCount ?? 0}</strong> contenu${(publishedCount ?? 0) > 1 ? "s" : ""} publié${(publishedCount ?? 0) > 1 ? "s" : ""}</td></tr>`);
      if ((leadsCount ?? 0) > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🎯</td><td style="padding:8px 16px;"><strong>${leadsCount}</strong> lead${(leadsCount ?? 0) > 1 ? "s" : ""} capturé${(leadsCount ?? 0) > 1 ? "s" : ""}</td></tr>`);
      if (wins && wins.salesCount > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">💶</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.salesCount)}</strong> vente${wins.salesCount > 1 ? "s" : ""} • <strong>${EUR_FMT.format(Math.round(wins.salesAmountCents / 100))}</strong> tracké${wins.salesCount > 1 ? "s" : ""}</td></tr>`);
      if (wins && wins.quizCompletes > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">✅</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.quizCompletes)}</strong> quiz complété${wins.quizCompletes > 1 ? "s" : ""} par tes visiteurs</td></tr>`);
      if (wins && wins.quizShares > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">📤</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.quizShares)}</strong> partage${wins.quizShares > 1 ? "s" : ""} de tes quiz</td></tr>`);
      if (pageViews > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">👁️</td><td style="padding:8px 16px;"><strong>${pageViews}</strong> vue${pageViews > 1 ? "s" : ""} sur tes pages</td></tr>`);
      statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">⚡</td><td style="padding:8px 16px;"><strong>${creditsUsed}</strong> crédit${creditsUsed > 1 ? "s" : ""} IA utilisé${creditsUsed > 1 ? "s" : ""}</td></tr>`);
      if ((tasksCompleted ?? 0) > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">✓</td><td style="padding:8px 16px;"><strong>${tasksCompleted}</strong> tâche${(tasksCompleted ?? 0) > 1 ? "s" : ""} terminée${(tasksCompleted ?? 0) > 1 ? "s" : ""}</td></tr>`);
      if (wins?.topQuiz) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🏆</td><td style="padding:8px 16px;">Top quiz : <strong>${escapeHtml(wins.topQuiz.title)}</strong> (${NUM_FMT.format(wins.topQuiz.completes)} complétion${wins.topQuiz.completes > 1 ? "s" : ""})</td></tr>`);
      if (wins && wins.milestonesUnlocked.length > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🎉</td><td style="padding:8px 16px;"><strong>${wins.milestonesUnlocked.length}</strong> milestone${wins.milestonesUnlocked.length > 1 ? "s" : ""} débloqué${wins.milestonesUnlocked.length > 1 ? "s" : ""} ce mois</td></tr>`);
    } else {
      statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">📝</td><td style="padding:8px 16px;"><strong>${publishedCount ?? 0}</strong> content${(publishedCount ?? 0) > 1 ? "s" : ""} published</td></tr>`);
      if ((leadsCount ?? 0) > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🎯</td><td style="padding:8px 16px;"><strong>${leadsCount}</strong> lead${(leadsCount ?? 0) > 1 ? "s" : ""} captured</td></tr>`);
      if (wins && wins.salesCount > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">💶</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.salesCount)}</strong> sale${wins.salesCount > 1 ? "s" : ""} • <strong>${EUR_FMT.format(Math.round(wins.salesAmountCents / 100))}</strong> tracked</td></tr>`);
      if (wins && wins.quizCompletes > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">✅</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.quizCompletes)}</strong> quiz completion${wins.quizCompletes > 1 ? "s" : ""} by your visitors</td></tr>`);
      if (wins && wins.quizShares > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">📤</td><td style="padding:8px 16px;"><strong>${NUM_FMT.format(wins.quizShares)}</strong> quiz share${wins.quizShares > 1 ? "s" : ""}</td></tr>`);
      if (pageViews > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">👁️</td><td style="padding:8px 16px;"><strong>${pageViews}</strong> page view${pageViews > 1 ? "s" : ""}</td></tr>`);
      statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">⚡</td><td style="padding:8px 16px;"><strong>${creditsUsed}</strong> AI credit${creditsUsed > 1 ? "s" : ""} used</td></tr>`);
      if ((tasksCompleted ?? 0) > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">✓</td><td style="padding:8px 16px;"><strong>${tasksCompleted}</strong> task${(tasksCompleted ?? 0) > 1 ? "s" : ""} completed</td></tr>`);
      if (wins?.topQuiz) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🏆</td><td style="padding:8px 16px;">Top quiz: <strong>${escapeHtml(wins.topQuiz.title)}</strong> (${NUM_FMT.format(wins.topQuiz.completes)} completion${wins.topQuiz.completes > 1 ? "s" : ""})</td></tr>`);
      if (wins && wins.milestonesUnlocked.length > 0) statLines.push(`<tr><td style="padding:8px 16px;font-size:28px;">🎉</td><td style="padding:8px 16px;"><strong>${wins.milestonesUnlocked.length}</strong> milestone${wins.milestonesUnlocked.length > 1 ? "s" : ""} unlocked this month</td></tr>`);
    }

    const statsTable = `<table style="width:100%;border-collapse:collapse;background:#f8f8fc;border-radius:12px;overflow:hidden;margin:16px 0;">${statLines.join("")}</table>`;

    const body = locale === "fr"
      ? `Voici ton récap du mois de <strong>${mName}</strong> :<br/><br/>${statsTable}<br/>Chaque pas compte. Continue sur ta lancée ce mois-ci !`
      : `Here's your <strong>${mName}</strong> recap:<br/><br/>${statsTable}<br/>Every step counts. Keep your momentum going this month!`;

    const greeting = name ? `${name},` : (locale === "fr" ? "Bonjour," : "Hello,");

    await sendEmail({
      to: user.email,
      subject: locale === "fr"
        ? `📊 Ton Tipote en chiffres — ${mName}`
        : `📊 Your Tipote in numbers — ${mName}`,
      greeting,
      body,
      ctaLabel: locale === "fr" ? "Voir mon tableau de bord" : "View my dashboard",
      ctaUrl: `${appUrl}/dashboard`,
      locale,
    });

    sent++;
  }

  return NextResponse.json({
    ok: true,
    results: [`monthly_report: ${sent} sent, ${skipped} skipped`],
  });
}
