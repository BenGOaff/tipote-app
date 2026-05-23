// app/api/cron/affiliate-trial-expiry/route.ts
//
// Cron quotidien qui gère la fin de vie des trials Tipote 1 mois
// pour les affiliés. Deux missions :
//
// 1. RAPPELS J-3 et J-1 : envoie un email de rappel "ton trial se
//    termine dans X jours" pour donner le temps à l'affilié de prendre
//    un abonnement s'il a aimé.
//
// 2. EXPIRATION : downgrade les profiles dont trial_expires_at est
//    passé. Plan elite + plan_source=affiliate_trial → plan=free,
//    plan_source=null, trial_expires_at=null.
//
// À programmer dans Vercel ou autre scheduler à 09:00 chaque jour.
// Auth : header Authorization Bearer <CRON_SECRET>.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function authorise(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

type ExpiringProfile = {
  id: string;
  email: string;
  first_name: string | null;
  plan: string | null;
  plan_source: string | null;
  trial_expires_at: string;
};

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
}

async function sendReminderEmail(
  profile: ExpiringProfile,
  daysLeft: number,
): Promise<void> {
  const name = profile.first_name ?? profile.email.split("@")[0];
  const subject =
    daysLeft === 1
      ? `Ton trial Tipote se termine demain, ${name}`
      : `Plus que ${daysLeft} jours sur ton trial Tipote`;

  const expiryFormatted = new Date(profile.trial_expires_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const body = `<p>Ton trial Tipote 1 mois se termine le <strong>${expiryFormatted}</strong>.</p>
<p>Si tu veux continuer à utiliser Tipote pour ton propre business (créer tes pages link-in-bio, gérer ta stratégie de contenu, capter des leads avec des quiz...), c'est le moment de prendre un abonnement.</p>
<p>Si tu ne veux pas continuer côté outil mais juste promouvoir, pas de souci — ton espace affilié reste accessible et toutes les ressources promo aussi.</p>
<p>Quel que soit ton choix, à la fin du trial ton compte repasse automatiquement en plan gratuit. Aucune CB ne sera débitée.</p>`;

  await sendEmail({
    to: profile.email,
    subject,
    greeting: `Salut ${name} 👋`,
    body,
    ctaLabel: "Voir les plans Tipote",
    ctaUrl: "https://www.tipote.fr/commande",
    locale: "fr",
    category: "affiliate_trial_reminder",
    preheader: `Plus que ${daysLeft} ${daysLeft > 1 ? "jours" : "jour"} pour décider.`,
  });
}

async function sendExpiryEmail(profile: ExpiringProfile): Promise<void> {
  const name = profile.first_name ?? profile.email.split("@")[0];
  await sendEmail({
    to: profile.email,
    subject: `Ton trial Tipote s'est terminé`,
    greeting: `Salut ${name} 👋`,
    body: `<p>Ton trial Tipote 1 mois s'est terminé hier. Ton compte est repassé en plan gratuit.</p>
<p>Tu peux toujours te connecter à app.tipote.com pour consulter tes données et utiliser les fonctionnalités du plan gratuit.</p>
<p>Si tu changes d'avis et veux reprendre Tipote en Elite, c'est par ici 👇</p>`,
    ctaLabel: "Découvrir les plans Tipote",
    ctaUrl: "https://www.tipote.fr/commande",
    locale: "fr",
    category: "affiliate_trial_ended",
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth — même pattern X-Cron-Secret que les autres crons Tipote
  // (sio-sync-sales, sio-reconcile, sync-payments, business-milestones).
  if (!authorise(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const inOneDay = new Date(now.getTime() + 24 * 3600 * 1000);
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  // ─── 1. RAPPELS ─────────────────────────────────────────────────
  // Profiles dont le trial expire dans [22h, 26h] ou [70h, 74h]
  // (fenêtre de 4h pour pas rater à cause d'un retard de cron).
  const remindersResult = { sent_3d: 0, sent_1d: 0 };
  for (const targetDays of [3, 1]) {
    const targetDate = new Date(now.getTime() + targetDays * 24 * 3600 * 1000);
    const windowStart = new Date(targetDate.getTime() - 2 * 3600 * 1000).toISOString();
    const windowEnd = new Date(targetDate.getTime() + 2 * 3600 * 1000).toISOString();

    const { data: candidates } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, plan, plan_source, trial_expires_at")
      .eq("plan_source", "affiliate_trial")
      .eq("plan", "elite")
      .gte("trial_expires_at", windowStart)
      .lte("trial_expires_at", windowEnd);

    for (const c of (candidates ?? []) as ExpiringProfile[]) {
      try {
        await sendReminderEmail(c, targetDays);
        if (targetDays === 1) remindersResult.sent_1d++;
        else remindersResult.sent_3d++;
      } catch (err) {
        console.error(
          `[cron/affiliate-trial-expiry] reminder send failed ${c.email}: ${err}`,
        );
      }
    }
  }

  // ─── 2. EXPIRATION + DOWNGRADE ──────────────────────────────────
  const expiredCount = { downgraded: 0, errors: 0 };
  const { data: expired } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, plan, plan_source, trial_expires_at")
    .eq("plan_source", "affiliate_trial")
    .eq("plan", "elite")
    .lt("trial_expires_at", now.toISOString());

  for (const p of (expired ?? []) as ExpiringProfile[]) {
    // 2a. Downgrade
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "free",
        plan_source: null,
        trial_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", p.id);
    if (updateErr) {
      console.error(`[cron/affiliate-trial-expiry] downgrade failed ${p.email}:`, updateErr.message);
      expiredCount.errors++;
      continue;
    }

    // 2b. Audit dans plan_change_log
    try {
      await supabaseAdmin.from("plan_change_log").insert({
        target_user_id: p.id,
        target_email: p.email,
        old_plan: "elite",
        new_plan: "free",
        reason: "affiliate_trial:expired",
      });
    } catch {
      // best-effort, on ne bloque pas le downgrade
    }

    // 2c. Email de fin de trial
    try {
      await sendExpiryEmail(p);
    } catch (err) {
      console.error(`[cron/affiliate-trial-expiry] expiry email failed ${p.email}:`, err);
    }

    expiredCount.downgraded++;
  }

  return NextResponse.json({
    ok: true,
    reminders: remindersResult,
    expirations: expiredCount,
    ran_at: now.toISOString(),
  });
}
