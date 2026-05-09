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
import {
  computeFiscalDeadlinesCH,
  type FiscalProfileCH,
} from "@/lib/compta/fiscalCalendarCH";
import {
  computeFiscalDeadlinesPT,
  type FiscalProfilePT,
} from "@/lib/compta/fiscalCalendarPT";
import {
  computeFiscalDeadlinesBE,
  type FiscalProfileBE,
} from "@/lib/compta/fiscalCalendarBE";
import {
  computeFiscalDeadlinesES,
  type FiscalProfileES,
} from "@/lib/compta/fiscalCalendarES";
import { detectCountryCode } from "@/lib/compta/countries";

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
      "user_id, project_id, country, accounting_status, ae_activity_type, ae_started_at, ae_versement_liberatoire, ae_vat_franchise, ae_urssaf_periodicity, ae_vat_regime, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime, sasu_vat_intra_enabled, sasu_dirigeant_remunere, eurl_is_election, sarl_gerant_majoritaire, ch_canton, ch_vat_assujetti, ch_vat_periodicity, ch_vat_method, ch_started_at, pt_nif, pt_region, pt_iva_isento, pt_iva_periodicity, pt_tax_regime, pt_started_at, be_region, be_company_number, be_vat_franchise, be_vat_periodicity, be_intra_eu_listing, be_started_at, es_community, es_company_number, es_iva_regime, es_iva_periodicity, es_redeme, es_irpf_method, es_started_at",
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
    const country = detectCountryCode(profile.country as string | null);
    if (country !== "FR" && country !== "CH" && country !== "PT" && country !== "BE" && country !== "ES") continue;

    const email = emailByUserId.get(userId) ?? "";
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    let all: FiscalDeadline[] = [];
    if (country === "FR") {
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
        ae_vat_regime: (profile.ae_vat_regime ?? null) as
          | "reel_mensuel"
          | "reel_trimestriel"
          | "simplifie"
          | null,
        sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
        sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
        sasu_vat_regime: (profile.sasu_vat_regime ?? null) as string | null,
        sasu_vat_intra_enabled: Boolean(profile.sasu_vat_intra_enabled),
        sasu_dirigeant_remunere: Boolean(profile.sasu_dirigeant_remunere),
        eurl_is_election: Boolean(profile.eurl_is_election),
        sarl_gerant_majoritaire: Boolean(profile.sarl_gerant_majoritaire),
      };
      all = computeFiscalDeadlines(fp, now, horizon);
    } else if (country === "CH") {
      const fpCh: FiscalProfileCH = {
        accounting_status: profile.accounting_status as FiscalProfileCH["accounting_status"],
        ch_canton: (profile.ch_canton ?? null) as string | null,
        ch_vat_assujetti: Boolean(profile.ch_vat_assujetti),
        ch_vat_periodicity: (profile.ch_vat_periodicity ?? null) as FiscalProfileCH["ch_vat_periodicity"],
        ch_vat_method: (profile.ch_vat_method ?? null) as FiscalProfileCH["ch_vat_method"],
        ch_started_at: (profile.ch_started_at ?? null) as string | null,
        sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
        sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
      };
      all = computeFiscalDeadlinesCH(fpCh, now, horizon);
    } else if (country === "PT") {
      const fpPt: FiscalProfilePT = {
        accounting_status: profile.accounting_status as FiscalProfilePT["accounting_status"],
        pt_nif: (profile.pt_nif ?? null) as string | null,
        pt_region: (profile.pt_region ?? null) as FiscalProfilePT["pt_region"],
        pt_iva_isento: Boolean(profile.pt_iva_isento),
        pt_iva_periodicity: (profile.pt_iva_periodicity ?? null) as FiscalProfilePT["pt_iva_periodicity"],
        pt_tax_regime: (profile.pt_tax_regime ?? null) as FiscalProfilePT["pt_tax_regime"],
        pt_started_at: (profile.pt_started_at ?? null) as string | null,
        sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
        sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
      };
      all = computeFiscalDeadlinesPT(fpPt, now, horizon);
    } else if (country === "BE") {
      const fpBe: FiscalProfileBE = {
        accounting_status: profile.accounting_status as FiscalProfileBE["accounting_status"],
        be_region: (profile.be_region ?? null) as FiscalProfileBE["be_region"],
        be_company_number: (profile.be_company_number ?? null) as string | null,
        be_vat_franchise: Boolean(profile.be_vat_franchise),
        be_vat_periodicity: (profile.be_vat_periodicity ?? null) as FiscalProfileBE["be_vat_periodicity"],
        be_intra_eu_listing: Boolean(profile.be_intra_eu_listing),
        be_started_at: (profile.be_started_at ?? null) as string | null,
        sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
        sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
      };
      all = computeFiscalDeadlinesBE(fpBe, now, horizon);
    } else {
      // ES
      const fpEs: FiscalProfileES = {
        accounting_status: profile.accounting_status as FiscalProfileES["accounting_status"],
        es_community: (profile.es_community ?? null) as FiscalProfileES["es_community"],
        es_company_number: (profile.es_company_number ?? null) as string | null,
        es_iva_regime: (profile.es_iva_regime ?? null) as FiscalProfileES["es_iva_regime"],
        es_iva_periodicity: (profile.es_iva_periodicity ?? null) as FiscalProfileES["es_iva_periodicity"],
        es_redeme: Boolean(profile.es_redeme),
        es_irpf_method: (profile.es_irpf_method ?? null) as FiscalProfileES["es_irpf_method"],
        es_started_at: (profile.es_started_at ?? null) as string | null,
        sasu_fiscal_year_calendar: Boolean(profile.sasu_fiscal_year_calendar),
        sasu_fiscal_year_start_month: (profile.sasu_fiscal_year_start_month ?? null) as number | null,
      };
      all = computeFiscalDeadlinesES(fpEs, now, horizon);
    }
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
