// app/api/account/reset/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function isMissingTableOrColumnError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    (m.includes("column") && (m.includes("does not exist") || m.includes("unknown"))) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

function isMissingRpcError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("function") && m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

async function bestEffortDeleteByUserId(supabase: any, table: string, userId: string, column = "user_id") {
  try {
    const res = await supabase.from(table).delete().eq(column, userId);
    if (res?.error) {
      if (!isMissingTableOrColumnError(res.error.message)) {
        console.error(`reset: delete failed on ${table}.${column}`, res.error);
      }
    }
  } catch (e) {
    console.error(`reset: unexpected error on ${table}.${column}`, e);
  }
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    /**
     * ✅ 0) Chemin "propre" : RPC reset_user()
     * - Si dispo => c’est elle qui fait tout (SECURITY DEFINER)
     * - Si pas dispo / erreur => fallback best-effort (ton ancien code)
     */
    try {
      const rpcRes = await supabase.rpc("reset_user");
      if (rpcRes?.error) {
        if (!isMissingRpcError(rpcRes.error.message)) {
          console.error("reset: rpc(reset_user) failed:", rpcRes.error);
          // si la RPC existe mais plante pour une autre raison, on renvoie l'erreur (pour debug)
          return NextResponse.json({ ok: false, error: rpcRes.error.message }, { status: 500 });
        }
        // sinon -> fallback
      } else {
        // RPC OK
        return NextResponse.json({ ok: true, via: "rpc" }, { status: 200 });
      }
    } catch (e) {
      // fallback
      console.error("reset: rpc(reset_user) unexpected error (fallback):", e);
    }

    /**
     * 🔁 Fallback : ton reset best-effort original
     * (ne casse jamais même si table/colonne manquante)
     */
    const deletions: Array<{ table: string; column?: string }> = [
      // stratégie / pyramides / persona / plan
      { table: "offer_pyramids", column: "user_id" },
      { table: "personas", column: "user_id" },
      { table: "strategies", column: "user_id" },
      { table: "strategy_goals", column: "user_id" },
      { table: "business_plan", column: "user_id" },

      // contenus / tâches (best-effort)
      { table: "content_item", column: "user_id" },
      { table: "content_items", column: "user_id" },
      { table: "contents", column: "user_id" },
      { table: "generated_contents", column: "user_id" },
      { table: "posts", column: "user_id" },
      { table: "project_tasks", column: "user_id" },
      { table: "tasks", column: "user_id" },
      { table: "todos", column: "user_id" },
      { table: "calendar_events", column: "user_id" },

      // analytics / compteurs / prefs / clés
      { table: "metrics", column: "user_id" },
      { table: "analytics_events", column: "user_id" },
      { table: "user_settings", column: "user_id" },
      { table: "user_counters", column: "user_id" },
      { table: "user_ai_keys", column: "user_id" },
      { table: "user_ai_providers", column: "user_id" },
      { table: "user_api_keys", column: "user_id" },

      // ressources user (si applicable chez toi)
      { table: "resources", column: "user_id" },
      { table: "resource_chunks", column: "user_id" },
      { table: "prompts", column: "user_id" },
      { table: "business_blocks", column: "user_id" },
    ];

    for (const d of deletions) {
      await bestEffortDeleteByUserId(supabase, d.table, userId, d.column ?? "user_id");
    }

    // fallback owner_id
    const ownerTables = ["contents", "content_items", "content_item", "tasks", "todos", "posts", "project_tasks", "resources", "prompts"];
    for (const t of ownerTables) {
      await bestEffortDeleteByUserId(supabase, t, userId, "owner_id");
    }

    // Reset onboarding : supprimer business_profiles (recommandé)
    await bestEffortDeleteByUserId(supabase, "business_profiles", userId, "user_id");

    return NextResponse.json({ ok: true, via: "fallback" }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in POST /api/account/reset:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
