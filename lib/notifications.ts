// lib/notifications.ts
// Server-side helper to create notifications (used by API routes, webhooks, crons)

import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
