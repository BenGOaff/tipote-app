// lib/notifications.ts
// Server-side helper to create notifications (used by API routes, webhooks, crons)

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

type CreateNotificationParams = {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  icon?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  project_id?: string | null;
  meta?: Record<string, unknown>;
};

export async function createNotification(params: CreateNotificationParams) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: params.user_id,
    project_id: params.project_id ?? null,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    icon: params.icon ?? null,
    action_url: params.action_url ?? null,
    action_label: params.action_label ?? null,
    meta: params.meta ?? {},
  });
  return { error };
}

export async function createNotificationForAllUsers(
  params: Omit<CreateNotificationParams, "user_id">,
) {
  const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
  if (listError) return { error: listError };

  const rows = users.users.map((u) => ({
    user_id: u.id,
    project_id: params.project_id ?? null,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    icon: params.icon ?? null,
    action_url: params.action_url ?? null,
    action_label: params.action_label ?? null,
    meta: params.meta ?? {},
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabaseAdmin.from("notifications").insert(rows.slice(i, i + BATCH));
    if (error) return { error };
  }

  return { error: null, count: rows.length };
}

// ----------------------------------------------------------------------------
// Phase 0/1 rétention (1er juin 2026, cf. ROADMAP_RETENTION.md) :
// helper unique pour créer une notif in-app ET (optionnellement) envoyer
// un email associé, avec idempotence garantie par email_dedupe_key.
//
// Pourquoi ne PAS étendre createNotification existant : signature stable
// pour les crons / webhooks actuels. On ajoute une variante explicite
// "WithEmail" pour clarifier l'intention côté call-sites rétention.
// ----------------------------------------------------------------------------

export type NotificationCategory =
  | "general"
  | "milestone"
  | "wins"
  | "reengagement"
  | "coach"
  | "sales"
  | "security"
  | "social";

export interface CreateNotificationWithEmailInput {
  userId: string;
  projectId?: string | null;
  type: string;
  category?: NotificationCategory;
  title: string;
  body?: string | null;
  icon?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  meta?: Record<string, unknown>;
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

export interface CreateNotificationWithEmailResult {
  ok: boolean;
  notificationId?: string;
  emailSent?: boolean;
  reason?: "inserted" | "dedupe_skip" | "missing_user" | "db_error";
  error?: string;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Crée une notif in-app dans la table `notifications` + envoie un email
 * associé si `email` est fourni. La paire (user_id, email_dedupe_key)
 * est UNIQUE quand email_dedupe_key est posée → INSERT idempotent.
 *
 * Catégorie stockée dans meta.category pour permettre l'opt-out fin par
 * type (Settings → catégories d'emails).
 *
 * Non-bloquant : toute erreur d'envoi email est loggée mais ne fait pas
 * rejeter la promesse (le call-site rétention est typiquement
 * fire-and-forget).
 */
export async function createNotificationWithEmail(
  input: CreateNotificationWithEmailInput,
): Promise<CreateNotificationWithEmailResult> {
  if (!input.userId) {
    return { ok: false, reason: "missing_user" };
  }

  const meta: Record<string, unknown> = {
    ...(input.meta ?? {}),
    category: input.category ?? "general",
  };

  const row: Record<string, unknown> = {
    user_id: input.userId,
    project_id: input.projectId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    icon: input.icon ?? null,
    action_url: input.actionUrl ?? null,
    action_label: input.actionLabel ?? null,
    meta,
    email_dedupe_key: input.emailDedupeKey ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: true, reason: "dedupe_skip" };
    }
    console.error("[notifications] insert failed", {
      type: input.type,
      category: input.category,
      error: error.message,
    });
    return { ok: false, reason: "db_error", error: error.message };
  }

  const notificationId = data?.id as string | undefined;
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
      if (emailSent && notificationId) {
        await supabaseAdmin
          .from("notifications")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", notificationId);
      }
    } catch (err) {
      console.error("[notifications] email send failed", err);
    }
  }

  return {
    ok: true,
    notificationId,
    emailSent,
    reason: "inserted",
  };
}
