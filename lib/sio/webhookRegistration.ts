// lib/sio/webhookRegistration.ts
// Automatically registers/deregisters Systeme.io webhooks for a user's SIO account.
// Called when a user saves their SIO API key in settings.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sioUserRequest } from "./userApiClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Events we want to receive from the user's SIO account
const WEBHOOK_EVENTS = ["NEW_SALE", "SALE_CANCELED", "CONTACT_CREATED"] as const;

// Max 10 webhooks per SIO account — we use 3, leaving 7 for the user
const WEBHOOK_RECEIVER_PATH = "/api/systeme-io/user-webhook";

/**
 * Register webhooks on the user's SIO account.
 * Idempotent: skips events that already have an active registration.
 */
export async function registerSioWebhooks(params: {
  userId: string;
  projectId: string | null;
  apiKey: string;
}): Promise<{ registered: number; errors: string[] }> {
  const { userId, projectId, apiKey } = params;
  const errors: string[] = [];
  let registered = 0;

  for (const eventType of WEBHOOK_EVENTS) {
    try {
      // Check if already registered
      const { data: existing } = await supabaseAdmin
        .from("sio_webhook_registrations")
        .select("id, sio_webhook_id, status")
        .eq("user_id", userId)
        .eq("event_type", eventType)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        // Already registered and active — skip
        continue;
      }

      // Generate a unique secret token for this webhook
      const secretToken = crypto.randomUUID();
      const webhookUrl = `${APP_URL}${WEBHOOK_RECEIVER_PATH}?token=${secretToken}`;

      // Register on SIO
      const res = await sioUserRequest(apiKey, "/webhooks", {
        method: "POST",
        body: {
          event: eventType,
          url: webhookUrl,
        },
      });

      if (!res.ok) {
        // SIO may return 422 if webhook limit reached or URL already exists
        errors.push(`${eventType}: SIO returned ${res.status} — ${res.error?.slice(0, 100)}`);
        continue;
      }

      const sioWebhookId = String(res.data?.id ?? "");

      // Store registration in DB (upsert to handle re-registrations)
      await supabaseAdmin.from("sio_webhook_registrations").upsert(
        {
          user_id: userId,
          project_id: projectId,
          sio_webhook_id: sioWebhookId,
          event_type: eventType,
          webhook_url: webhookUrl,
          secret_token: secretToken,
          status: "active",
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,event_type" },
      );

      registered++;
      console.log(`[SIO webhooks] Registered ${eventType} for user ${userId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${eventType}: ${msg}`);
      console.error(`[SIO webhooks] Failed to register ${eventType}:`, msg);
    }
  }

  return { registered, errors };
}

/**
 * Remove all SIO webhooks for a user (called when API key is removed or changed).
 */
export async function deregisterSioWebhooks(params: {
  userId: string;
  projectId: string | null;
  apiKey?: string; // If available, also delete from SIO
}): Promise<void> {
  const { userId, projectId, apiKey } = params;

  // Fetch existing registrations
  let query = supabaseAdmin
    .from("sio_webhook_registrations")
    .select("id, sio_webhook_id, event_type")
    .eq("user_id", userId)
    .eq("status", "active");

  if (projectId) query = query.eq("project_id", projectId);

  const { data: regs } = await query;
  if (!regs || regs.length === 0) return;

  // Delete from SIO (best effort)
  if (apiKey) {
    for (const reg of regs) {
      if (reg.sio_webhook_id) {
        try {
          await sioUserRequest(apiKey, `/webhooks/${reg.sio_webhook_id}`, {
            method: "DELETE",
          });
        } catch {
          // Best effort — SIO may have already deleted it
        }
      }
    }
  }

  // Mark as deleted in DB
  const ids = regs.map((r) => r.id);
  await supabaseAdmin
    .from("sio_webhook_registrations")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .in("id", ids);

  console.log(`[SIO webhooks] Deregistered ${ids.length} webhooks for user ${userId}`);
}
