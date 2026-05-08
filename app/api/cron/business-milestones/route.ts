// GET /api/cron/business-milestones
//
// Cron quotidien qui détecte les "moments business" qui méritent une
// notification chez l'user :
//   • 🎯 Objectif mensuel à 50% (encouragement mi-parcours)
//   • 🏆 Objectif mensuel atteint (100%) — célébrer
//   • ⚠️ Au moins 1 abonné qui a arrêté son abo ce mois — agir vite
//
// Idempotent : pour chaque (user, type), on n'envoie l'email qu'UNE
// fois par mois. Stocké via la table `notifications` (avec le mois
// dans meta.period). Pas de table dédiée — on réutilise l'existant.
//
// Auth : header X-Cron-Secret comme les autres crons Tipote.
//
// À installer dans la crontab :
//   0 9 * * * curl -fsS -H "X-Cron-Secret: $CRON_SECRET" \
//     https://app.tipote.com/api/cron/business-milestones \
//     > /tmp/business-milestones.log 2>&1
// 9h du matin : tombe quand l'user ouvre sa boîte mail au réveil.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, canSendEmailToday } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { buildBusinessContext } from "@/lib/compta/businessContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

/** Period = "YYYY-MM" courant. Sert de clé d'idempotence pour
 *  n'envoyer chaque type d'email qu'une fois par mois. */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface MilestoneResult {
  user_id: string;
  type: string;
  sent: boolean;
  reason?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const period = currentPeriod();

  // On itère sur business_profiles qui ont un objectif fixé (sinon
  // pas la peine de regarder). On utilise project_id pour scoping
  // multi-projets.
  const { data: profiles, error } = await supabaseAdmin
    .from("business_profiles")
    .select("user_id, project_id, revenue_goal_monthly")
    .not("revenue_goal_monthly", "is", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: MilestoneResult[] = [];
  let processed = 0;

  for (const profile of (profiles ?? []) as Array<{
    user_id: string;
    project_id: string | null;
    revenue_goal_monthly: unknown;
  }>) {
    processed += 1;
    const userId = profile.user_id;
    const projectId = profile.project_id;

    // Récupère le contexte business — réutilisation du helper unifié
    const ctx = await buildBusinessContext(userId, projectId).catch(() => null);
    if (!ctx || !ctx.data || !ctx.data.has_revenue_data) continue;

    // 1. Milestone "objectif atteint" (100%+)
    if (ctx.data.progress_pct !== null && ctx.data.progress_pct >= 100) {
      const r = await maybeSendMilestone(userId, projectId, period, "goal_reached", ctx);
      results.push(r);
    }
    // 2. Milestone "moitié de l'objectif" (50-99% ET au moins jour 10
    //    du mois pour ne pas féliciter celui qui boucle son objectif
    //    le 1er du mois)
    else if (
      ctx.data.progress_pct !== null &&
      ctx.data.progress_pct >= 50 &&
      ctx.data.progress_pct < 100 &&
      new Date().getUTCDate() >= 10
    ) {
      const r = await maybeSendMilestone(userId, projectId, period, "goal_half", ctx);
      results.push(r);
    }

    // 3. Alerte churn (au moins 1 abonné arrêté ce mois)
    if (ctx.data.churned_customers_count > 0) {
      const r = await maybeSendMilestone(userId, projectId, period, "churn_alert", ctx);
      results.push(r);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent).length,
    results,
  });
}

interface BizContext {
  text: string;
  data: NonNullable<Awaited<ReturnType<typeof buildBusinessContext>>["data"]>;
}

async function maybeSendMilestone(
  userId: string,
  projectId: string | null,
  period: string,
  type: "goal_reached" | "goal_half" | "churn_alert",
  ctx: BizContext,
): Promise<MilestoneResult> {
  // Idempotence : a-t-on déjà envoyé ce type ce mois ?
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", `milestone_${type}`)
    .contains("meta", { period })
    .limit(1);

  if (existing && existing.length > 0) {
    return { user_id: userId, type, sent: false, reason: "already_sent_this_month" };
  }

  // Respect des préférences email + rate limit global
  const { data: prefs } = await supabaseAdmin
    .from("email_preferences")
    .select("milestones, social_alerts")
    .eq("user_id", userId)
    .maybeSingle();
  const prefRow = prefs as { milestones?: boolean | null; social_alerts?: boolean | null } | null;
  // On reuse social_alerts comme fallback puisque c'est la pref qui
  // existe déjà ; les milestones sont une catégorie distincte mais
  // ne pas en avoir = on envoie quand même (opt-out par défaut)
  if (prefRow?.milestones === false) {
    return { user_id: userId, type, sent: false, reason: "opt_out" };
  }
  if (!(await canSendEmailToday(userId, supabaseAdmin))) {
    return { user_id: userId, type, sent: false, reason: "rate_limit" };
  }

  // Récupère email + nom
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!user?.email) {
    return { user_id: userId, type, sent: false, reason: "no_email" };
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, content_locale")
    .eq("id", userId)
    .maybeSingle();
  const firstName =
    (profile as { first_name?: string | null } | null)?.first_name?.trim() ?? "";
  const greeting = firstName ? `${firstName},` : "Bonjour,";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";

  // Compose le contenu selon le type
  let subject = "";
  let preheader = "";
  let body = "";
  let ctaLabel = "Voir mon dashboard";
  let ctaUrl = `${appUrl}/app`;
  let title = "";
  let icon = "trophy";

  const formatEur = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  if (type === "goal_reached") {
    subject = `🎯 Tu as atteint ton objectif du mois — bravo !`;
    preheader = `Tu as fait ${formatEur(ctx.data.current_month_eur)} sur les ${formatEur(ctx.data.objective_eur ?? 0)} prévus.`;
    body = `
      <p>Tu viens d&apos;atteindre <strong>100% de ton objectif mensuel</strong> :
      ${formatEur(ctx.data.current_month_eur)} sur ${formatEur(ctx.data.objective_eur ?? 0)} visés.</p>
      <p>Il te reste ${ctx.data.days_remaining_in_month} jour${ctx.data.days_remaining_in_month > 1 ? "s" : ""} dans le mois.
      C&apos;est le bon moment pour te demander : qu&apos;est-ce que je fais avec ce surplus ?
      Investir dans la croissance, augmenter mes prix pour le mois prochain, ou prendre une vraie pause ?</p>`;
    ctaLabel = "Définir mon prochain palier";
    ctaUrl = `${appUrl}/strategy`;
    title = "Objectif atteint !";
    icon = "trophy";
  } else if (type === "goal_half") {
    subject = `📈 Tu es à mi-parcours sur ton objectif`;
    preheader = `${Math.round(ctx.data.progress_pct ?? 0)} % atteint, il reste ${ctx.data.days_remaining_in_month} jours.`;
    body = `
      <p>Tu as fait <strong>${formatEur(ctx.data.current_month_eur)}</strong>
      sur les ${formatEur(ctx.data.objective_eur ?? 0)} visés ce mois — soit
      ${Math.round(ctx.data.progress_pct ?? 0)} %.</p>
      <p>Il te reste ${ctx.data.days_remaining_in_month} jour${ctx.data.days_remaining_in_month > 1 ? "s" : ""}
      pour boucler. Pile le moment de poster un peu plus, relancer un prospect ou
      activer une offre flash si tu veux finir fort.</p>`;
    title = "Mi-parcours sur ton objectif";
    icon = "target";
  } else if (type === "churn_alert") {
    subject = `⚠️ ${ctx.data.churned_customers_count} abonné${ctx.data.churned_customers_count > 1 ? "s" : ""} ${ctx.data.churned_customers_count > 1 ? "ont" : "a"} arrêté ce mois`;
    preheader = "Avant qu'ils oublient pourquoi ils s'étaient inscrits.";
    body = `
      <p><strong>${ctx.data.churned_customers_count} client${ctx.data.churned_customers_count > 1 ? "s" : ""}</strong>
      qui ${ctx.data.churned_customers_count > 1 ? "avaient" : "avait"} un abonnement le mois dernier
      ${ctx.data.churned_customers_count > 1 ? "n&apos;ont" : "n&apos;a"} pas renouvelé ce mois-ci.</p>
      <p>C&apos;est le moment idéal pour leur envoyer un message court — pas
      pour vendre, juste pour comprendre. Une réponse t&apos;apprendra plus
      sur ton offre que 10 sondages.</p>
      <p>Va sur l&apos;onglet <em>Mes Clients</em> pour les identifier (badge
      "A arrêté son abo").</p>`;
    ctaLabel = "Voir mes clients";
    ctaUrl = `${appUrl}/clients`;
    title = `${ctx.data.churned_customers_count} abonné${ctx.data.churned_customers_count > 1 ? "s arrêtés" : " arrêté"}`;
    icon = "alert-triangle";
  }

  const result = await sendEmail({
    to: user.email,
    subject,
    greeting,
    body,
    ctaLabel,
    ctaUrl,
    preheader,
    locale: (profile as { content_locale?: string | null } | null)?.content_locale || "fr",
    category: "milestone",
  });

  // Track la notif (idempotence + cloche in-app)
  await createNotification({
    user_id: userId,
    project_id: projectId,
    type: `milestone_${type}`,
    title,
    body: preheader,
    icon,
    action_url: ctaUrl.replace(appUrl, ""),
    action_label: ctaLabel,
    meta: {
      period,
      email_sent: result.ok,
      progress_pct: ctx.data.progress_pct,
      churned_count: ctx.data.churned_customers_count,
    },
  });

  return { user_id: userId, type, sent: result.ok };
}
