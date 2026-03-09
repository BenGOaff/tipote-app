// app/api/account/delete/route.ts
// Supprime définitivement le compte utilisateur (données + auth).
// L'utilisateur doit être connecté. Annule l'abonnement Systeme.io s'il existe.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listSubscriptionsForContact,
  cancelSubscriptionOnSystemeIo,
} from "@/lib/systemeIoClient";

function parseContactId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isMissingTableError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("pgrst");
}

async function bestEffortDelete(table: string, userId: string, column = "user_id") {
  try {
    const res = await supabaseAdmin.from(table).delete().eq(column, userId);
    if (res?.error && !isMissingTableError(res.error.message)) {
      console.warn(`[account/delete] delete ${table}.${column} failed:`, res.error.message);
    }
  } catch {
    // ignore
  }
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const email = user.email ?? null;

    console.log(`[account/delete] Starting account deletion for user ${userId} (${email})`);

    // 1) Cancel active Systeme.io subscription (best-effort)
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("sio_contact_id, plan")
        .eq("id", userId)
        .maybeSingle();

      const contactId = parseContactId(profile?.sio_contact_id);

      if (contactId) {
        const collection = await listSubscriptionsForContact(contactId, { limit: 50, order: "desc" });
        const subs = (collection.subscriptions ?? []) as any[];

        for (const sub of subs) {
          const status = String(sub?.status ?? "").toLowerCase();
          if (status === "active" || status === "trialing") {
            try {
              await cancelSubscriptionOnSystemeIo({ id: String(sub.id), cancel: "Now" });
              console.log(`[account/delete] Canceled subscription ${sub.id} on Systeme.io`);
            } catch (e) {
              console.warn(`[account/delete] Failed to cancel subscription ${sub.id}:`, e);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[account/delete] Failed to cancel Systeme.io subscriptions (continuing):", e);
    }

    // 2) Delete all user data from ALL tables (best-effort, parallel)
    const tables = [
      // Business & onboarding
      { table: "business_profiles" },
      { table: "onboarding_messages" },
      { table: "onboarding_facts" },
      { table: "onboarding_sessions" },

      // Strategy
      { table: "offer_pyramids" },
      { table: "personas" },
      { table: "strategies" },
      { table: "strategy_goals" },
      { table: "business_plan" },
      { table: "competitor_analyses" },

      // Contents & tasks
      { table: "content_item" },
      { table: "content_items" },
      { table: "contents" },
      { table: "generated_contents" },
      { table: "posts" },
      { table: "project_tasks" },
      { table: "tasks" },
      { table: "todos" },
      { table: "calendar_events" },

      // Analytics
      { table: "metrics" },
      { table: "analytics_events" },

      // Resources
      { table: "resources" },
      { table: "resource_chunks" },

      // Prompts & blocks
      { table: "prompts" },
      { table: "business_blocks" },

      // Coach / chat
      { table: "coach_messages" },
      { table: "chat_messages" },
      { table: "chat_sessions" },

      // Automations & social
      { table: "auto_comment_logs" },
      { table: "social_automations" },
      { table: "social_connections" },

      // Quiz
      { table: "quiz_results" },
      { table: "quiz_leads" },
      { table: "quiz_questions" },
      { table: "quizzes" },

      // Pepites
      { table: "user_pepites" },
      { table: "user_pepites_state" },

      // Credits
      { table: "user_credits", column: "user_id" },

      // Logs
      { table: "plan_change_log", column: "target_user_id" },
      { table: "webhook_logs" },
    ];

    await Promise.allSettled(
      tables.map((t) => bestEffortDelete(t.table, userId, t.column ?? "user_id")),
    );

    // Also try with owner_id for legacy tables
    const ownerTables = [
      "contents", "content_items", "content_item", "tasks", "todos", "posts",
      "project_tasks", "resources", "prompts", "business_plan", "strategies",
      "personas", "offer_pyramids", "onboarding_sessions", "onboarding_facts",
      "onboarding_messages", "competitor_analyses", "coach_messages",
      "auto_comment_logs",
    ];
    await Promise.allSettled(
      ownerTables.map((t) => bestEffortDelete(t, userId, "owner_id")),
    );

    // 3) Delete profiles row
    try {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
    } catch (e) {
      console.warn("[account/delete] Failed to delete profiles row:", e);
    }

    // 4) Delete auth user (via admin API)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[account/delete] Failed to delete auth user:", authError);
      return NextResponse.json(
        { ok: false, error: "Données supprimées mais impossible de supprimer le compte auth. Contacte le support." },
        { status: 500 },
      );
    }

    console.log(`[account/delete] Successfully deleted user ${userId} (${email})`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account/delete] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
