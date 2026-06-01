// GET /api/cron/value-nudges
//
// Cron quotidien — phase 3 ROADMAP_RETENTION.md.
// Détecte les users qui n'ont rien PRODUIT (post / quiz / page / popquiz)
// depuis 7+ jours et leur envoie UN email à valeur (3 idées de posts
// prêtes à publier — pas une relance générique "tu nous manques").
//
// COMPLÈTE le cron `engagement` existant qui fait J7/J14 basé sur
// last_sign_in_at avec un body générique. Ici on cible la PRODUCTION
// (business_events) et on apporte du concret. Les deux peuvent
// coexister ; le rate-limit global canSendEmailToday() évite qu'un
// même user reçoive 2 emails le même jour.
//
// Esprit Béné (1er juin 2026) : décontracté, on aide, on n'angoisse
// jamais. Pas de countdown, pas de chiffre de honte ("tu n'as rien
// fait depuis X jours"), pas de "tu vas perdre". Une main tendue, un
// CTA actionnable en 5 minutes.
//
// Auth : pattern identique à monthly-report / engagement / weekly-digest
// (Bearer ou ?secret=, valeur = NOTIFICATIONS_INTERNAL_KEY ou
// SUPABASE_SERVICE_ROLE_KEY).
//
// À installer dans la crontab (1x/jour, 10h locale) :
//   0 10 * * * curl -fsS -H "Authorization: Bearer $NOTIFICATIONS_INTERNAL_KEY" \
//     https://app.tipote.com/api/cron/value-nudges \
//     > /tmp/value-nudges.log 2>&1

import { NextRequest, NextResponse } from "next/server";

import { canSendEmailToday, sendEmail } from "@/lib/email";
import {
  detectReengagementBucket,
  fetchUserHighlights,
} from "@/lib/reengagement/detector";
import {
  buildNudgeTemplate,
  type Locale,
} from "@/lib/reengagement/templates";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const INTERNAL_KEY =
  process.env.NOTIFICATIONS_INTERNAL_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

// Type de notification utilisé pour le dédup en DB. Évite un doublon
// avec les `inactivity_7d` / `inactivity_14d` du cron engagement (ce
// sont d'autres types → pas de collision).
const NUDGE_TYPE = "value_nudge_idle_producer_7d";

// Fenêtre de dédup : 1 email par bucket par 14 jours. Si un user reste
// inactif sur la production, on lui en renvoie un toutes les 2 semaines
// max. Au-delà, c'est du spam.
const DEDUP_WINDOW_DAYS = 14;

interface SendResult {
  userId: string;
  emailSent: boolean;
  skipped?: string;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get("secret") ?? "";

  if ((!token || token !== INTERNAL_KEY) && (!cronSecret || cronSecret !== INTERNAL_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com").replace(/\/$/, "");
  const now = new Date();
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data: allUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 10000,
  });
  if (listErr) {
    return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
  }

  const results: SendResult[] = [];
  let sent = 0;
  let skipped = 0;

  for (const user of allUsers?.users ?? []) {
    if (!user.email) {
      results.push({ userId: user.id, emailSent: false, skipped: "no_email" });
      skipped += 1;
      continue;
    }

    const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;

    // ── Détection bucket ──
    const bucket = await detectReengagementBucket({
      userId: user.id,
      lastSignInAt,
      now,
    });
    if (!bucket) {
      skipped += 1;
      continue;
    }

    // ── Opt-out check (réutilise email_preferences.weekly_digest comme
    //    proxy général d'opt-out emails non-critiques, pattern repris
    //    du cron engagement existant pour cohérence) ──
    const { data: prefs } = await supabaseAdmin
      .from("email_preferences")
      .select("weekly_digest")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prefs && prefs.weekly_digest === false) {
      results.push({ userId: user.id, emailSent: false, skipped: "opted_out" });
      skipped += 1;
      continue;
    }

    // ── Dédup : pas plus d'un email de ce type par fenêtre de 14j ──
    const { data: existingNudges } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", NUDGE_TYPE)
      .gte("created_at", dedupCutoff.toISOString())
      .limit(1);
    if (existingNudges && existingNudges.length > 0) {
      results.push({ userId: user.id, emailSent: false, skipped: "dedup" });
      skipped += 1;
      continue;
    }

    // ── Rate limit global quotidien (helper partagé avec autres crons) ──
    if (!(await canSendEmailToday(user.id, supabaseAdmin))) {
      results.push({ userId: user.id, emailSent: false, skipped: "daily_cap" });
      skipped += 1;
      continue;
    }

    // ── Profil pour personnalisation (locale + prénom) ──
    const { data: profile } = await supabaseAdmin
      .from("business_profiles")
      .select("first_name, content_locale")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const locale: Locale = profile?.content_locale === "en" ? "en" : "fr";
    const firstName = (profile?.first_name as string | null | undefined) ?? "";

    // ── Highlights pour personnaliser le body (best post / quiz) ──
    const highlights = await fetchUserHighlights(user.id);
    const template = buildNudgeTemplate(bucket, {
      firstName,
      highlights,
      locale,
    });

    // ── Envoi email ──
    try {
      await sendEmail({
        to: user.email,
        subject: template.subject,
        greeting: template.greeting,
        body: template.htmlBody,
        ctaLabel: template.ctaLabel,
        ctaUrl: `${appUrl}${template.ctaPath}`,
        locale,
        preheader: template.preheader,
        category: "reengagement",
      });
    } catch (err) {
      console.error("[value-nudges] sendEmail failed", err);
      results.push({ userId: user.id, emailSent: false, skipped: "send_error" });
      continue;
    }

    // ── Track in notifications pour le dédup futur + bell in-app ──
    await supabaseAdmin.from("notifications").insert({
      user_id: user.id,
      type: NUDGE_TYPE,
      title: template.greeting.replace(/,$/, ""),
      body: template.preheader,
      icon: "💡",
      action_url: template.ctaPath,
      action_label: template.ctaLabel,
      meta: {
        email_sent: true,
        bucket,
        category: "reengagement",
      },
    });

    sent += 1;
    results.push({ userId: user.id, emailSent: true });
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    processed: results.length,
    sample: results.slice(0, 50),
  });
}
