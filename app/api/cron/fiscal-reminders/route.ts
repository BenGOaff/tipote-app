// GET /api/cron/fiscal-reminders
//
// Cron quotidien qui envoie un rappel email + une notification
// in-app aux users français pour chaque échéance fiscale qui tombe
// dans les 7 jours à venir.
//
// Idempotent par (user, project, deadline_id) : on stocke chaque
// envoi dans la table `notifications` (type = 'fiscal_reminder',
// meta = { deadline_id }) — comme business-milestones réutilise la
// même table avec un period.
//
// Auth : header X-Cron-Secret comme les autres crons.
//
// À installer dans la crontab :
//   0 8 * * * curl -fsS -H "X-Cron-Secret: $CRON_SECRET" \
//     https://app.tipote.com/api/cron/fiscal-reminders \
//     > /tmp/fiscal-reminders.log 2>&1
// 8h du matin : un cran avant business-milestones (9h) pour ne pas
// noyer l'user de mails simultanés.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import {
  computeFiscalDeadlines,
  pickUrgentDeadlines,
  type FiscalProfile,
  type FiscalDeadline,
} from "@/lib/compta/fiscalCalendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

const FRANCE_TOKENS = ["france", "fr", "française", "francaise", "fra"];

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

function isFrance(country: string | null | undefined): boolean {
  if (!country) return false;
  return FRANCE_TOKENS.includes(country.trim().toLowerCase());
}

interface ReminderResult {
  user_id: string;
  deadline_id: string;
  sent: boolean;
  reason?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // On itère sur les profils FR avec un statut configuré. Les autres
  // n'ont pas de calendrier fiscal donc rien à rappeler.
  const { data: profiles, error } = await supabaseAdmin
    .from("business_profiles")
    .select(
      "user_id, project_id, country, accounting_status, ae_activity_type, ae_started_at, ae_versement_liberatoire, ae_vat_franchise, ae_urssaf_periodicity, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime, sasu_vat_intra_enabled, sasu_dirigeant_remunere",
    )
    .not("accounting_status", "is", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Une seule passe pour récupérer les emails (même pattern que
  // weekly-digest / monthly-report). Évite N requêtes à auth.admin.
  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
  const emailByUserId = new Map<string, string>();
  for (const u of allUsers?.users ?? []) {
    if (u.id && u.email) emailByUserId.set(u.id, u.email);
  }

  const results: ReminderResult[] = [];
  let processed = 0;

  for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
    processed += 1;
    const userId = profile.user_id as string;
    const projectId = (profile.project_id ?? null) as string | null;
    const country = profile.country as string | null;
    if (!isFrance(country)) continue;

    const email = emailByUserId.get(userId) ?? "";

    const fp: FiscalProfile = {
      accounting_status: profile.accounting_status as FiscalProfile["accounting_status"],
      ae_activity_type: (profile.ae_activity_type ?? null) as string | null,
      ae_started_at: (profile.ae_started_at ?? null) as string | null,
      ae_versement_liberatoire: Boolean(profile.ae_versement_liberatoire),
      ae_vat_franchise: Boolean(profile.ae_vat_franchise),
      ae_urssaf_periodicity: (profile.ae_urssaf_periodicity ?? null) as
        | "mensuelle"
        | "trimestrielle"
        | null,
      sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
      sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
      sasu_vat_regime: (profile.sasu_vat_regime ?? null) as string | null,
      sasu_vat_intra_enabled: Boolean(profile.sasu_vat_intra_enabled),
      sasu_dirigeant_remunere: Boolean(profile.sasu_dirigeant_remunere),
    };

    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const all = computeFiscalDeadlines(fp, now, horizon);
    const urgent = pickUrgentDeadlines(all, 7, now);

    for (const deadline of urgent) {
      const r = await maybeSendReminder(userId, projectId, email, deadline);
      results.push(r);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent).length,
  });
}

/** Envoie le rappel pour une (user, deadline) si pas déjà envoyé.
 *  Idempotence : `notifications` row avec type='fiscal_reminder' et
 *  meta.deadline_id = deadline.id. */
async function maybeSendReminder(
  userId: string,
  projectId: string | null,
  email: string,
  deadline: FiscalDeadline,
): Promise<ReminderResult> {
  // Check si déjà envoyé pour cette échéance précise.
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "fiscal_reminder")
    .filter("meta->>deadline_id", "eq", deadline.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { user_id: userId, deadline_id: deadline.id, sent: false, reason: "already_sent" };
  }

  // Notification in-app
  await createNotification({
    user_id: userId,
    project_id: projectId,
    type: "fiscal_reminder",
    title: `📅 ${deadline.title}`,
    body: deadline.description,
    icon: "calendar",
    action_url: deadline.officialUrl,
    action_label: "Aller déclarer",
    meta: { deadline_id: deadline.id, due_date: deadline.dueDate, kind: deadline.kind },
  });

  // Email (si on a l'adresse) — sendEmail wrappe lui-même le body
  // dans le template Tipote (greeting, footer, branding), donc on
  // passe juste le contenu central.
  if (email) {
    await sendEmail({
      to: email,
      subject: `Échéance fiscale dans 7 jours — ${deadline.title}`,
      greeting: "Petit rappel d'échéance fiscale",
      preheader: `${deadline.title} due le ${frenchDate(deadline.dueDate)}`,
      body: `<p><strong>${deadline.title}</strong> est due le <strong>${frenchDate(deadline.dueDate)}</strong>.</p><p>${deadline.description}</p>`,
      ctaLabel: "Aller déclarer sur le site officiel",
      ctaUrl: deadline.officialUrl,
      footerText:
        "Tipote ne déclare pas pour toi — on te rappelle juste les échéances. Tu peux gérer tes rappels dans Paramètres → Compta.",
      category: "fiscal_reminder",
    }).catch(() => null);
  }

  return { user_id: userId, deadline_id: deadline.id, sent: true };
}

const FRENCH_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function frenchDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return `${d} ${FRENCH_MONTHS[m - 1] ?? ""} ${y}`;
}
