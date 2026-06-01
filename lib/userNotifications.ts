// lib/userNotifications.ts
//
// Helper unique pour créer une notif in-app + (optionnellement) envoyer
// un email associé. Consommé par les chantiers rétention de
// `ROADMAP_RETENTION.md` (milestones phase 1, Wall of Wins récap mensuel
// phase 2, réengagement phase 3, coach proactif phase 4).
//
// Principe sécurité (rappel Béné 1er juin 2026) :
//   - Aucun appel ici ne doit JAMAIS bloquer ou modifier un flow visiteur
//     existant. Les call-sites doivent fire-and-forget après le succès
//     de leur logique métier (capture lead, publication post, etc.).
//   - Si l'INSERT notification échoue → on log console, on ne throw pas.

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NotificationCategory =
  | "general"
  | "milestone"
  | "wins"
  | "reengagement"
  | "coach"
  | "sales"
  | "security"
  | "social";

export interface CreateUserNotificationInput {
  userId: string;
  projectId?: string | null;
  kind: string;
  category?: NotificationCategory;
  title?: string | null;
  body?: string | null;
  payload?: Record<string, unknown>;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  emoji?: string | null;
  emailDedupeKey?: string | null;
  email?: {
    to: string;
    subject: string;
    greeting: string;
    htmlBody: string;
    ctaLabel?: string;
    ctaUrl?: string;
    locale?: string;
    preheader?: string;
  } | null;
}

export interface CreateUserNotificationResult {
  ok: boolean;
  notificationId?: number;
  emailSent?: boolean;
  reason?: "inserted" | "dedupe_skip" | "missing_user" | "db_error";
  error?: string;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Crée une notification in-app et, si `email` est fourni, envoie aussi
 * un email via le helper Resend (`lib/email.ts → sendEmail`).
 *
 * Dedupe : si `emailDedupeKey` est fourni et qu'une notif avec la même
 * clé existe déjà pour ce user → renvoie `{ok: true, reason: "dedupe_skip"}`.
 */
export async function createUserNotification(
  input: CreateUserNotificationInput,
  client: SupabaseClient = supabaseAdmin,
): Promise<CreateUserNotificationResult> {
  if (!input.userId) {
    return { ok: false, reason: "missing_user" };
  }

  const row = {
    user_id: input.userId,
    project_id: input.projectId ?? null,
    kind: input.kind,
    category: input.category ?? "general",
    title: input.title ?? null,
    body: input.body ?? null,
    payload: input.payload ?? {},
    cta_label: input.ctaLabel ?? null,
    cta_href: input.ctaHref ?? null,
    emoji: input.emoji ?? null,
    email_dedupe_key: input.emailDedupeKey ?? null,
  };

  const { data, error } = await client
    .from("user_notifications")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: true, reason: "dedupe_skip" };
    }
    console.error("[userNotifications] insert failed", {
      kind: input.kind,
      category: input.category,
      error: error.message,
    });
    return { ok: false, reason: "db_error", error: error.message };
  }

  let emailSent = false;
  if (input.email) {
    try {
      const emailRes = await sendEmail({
        to: input.email.to,
        subject: input.email.subject,
        greeting: input.email.greeting,
        body: input.email.htmlBody,
        ctaLabel: input.email.ctaLabel,
        ctaUrl: input.email.ctaUrl,
        locale: input.email.locale,
        preheader: input.email.preheader,
        category: input.category ?? "general",
      });
      emailSent = !!emailRes?.ok;
      if (emailSent && data?.id) {
        await client
          .from("user_notifications")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", data.id);
      }
    } catch (err) {
      console.error("[userNotifications] email send failed", err);
    }
  }

  return {
    ok: true,
    notificationId: data?.id,
    emailSent,
    reason: "inserted",
  };
}
