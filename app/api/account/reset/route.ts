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

async function bestEffortDeleteByUserId(
  supabase: any,
  table: string,
  userId: string,
  column = "user_id"
) {
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

async function bestEffortResetBusinessProfile(supabase: any, userId: string) {
  // Objectif: forcer le retour onboarding, même si DELETE est bloqué par RLS.
  // 1) On essaie de supprimer (ancien comportement)
  try {
    const del = await supabase.from("business_profiles").delete().eq("user_id", userId);
    if (!del?.error) return;

    // Si erreur "table/colonne" => on ne peut pas faire mieux
    if (isMissingTableOrColumnError(del.error.message)) return;

    // Si RLS interdit le DELETE, on passe en UPDATE (souvent autorisé sur sa propre ligne)
    console.warn("reset: business_profiles delete blocked, fallback to update", del.error);
  } catch (e) {
    console.warn("reset: business_profiles delete threw, fallback to update", e);
  }

  // 2) Fallback UPDATE best-effort (ne casse pas si colonnes manquent)
  const payload: Record<string, any> = {
    onboarding_completed: false,

    // Champs onboarding typiques (best-effort)
    first_name: null,
    country: null,
    niche: null,
    mission: null,
    business_maturity: null,
    offers_status: null,
    main_goals: null,
    preferred_content_types: null,
    tone_preference: null,

    // Si tu as ce champ dans business_profiles (souvent utilisé côté onboarding)
    primary_activity: null,
  };

  try {
    const upd = await supabase.from("business_profiles").update(payload).eq("user_id", userId);
    if (!upd?.error) return;

    // Si certaines colonnes n’existent pas, on retry minimal
    if (isMissingTableOrColumnError(upd.error.message)) {
      const upd2 = await supabase
        .from("business_profiles")
        .update({ onboarding_completed: false })
        .eq("user_id", userId);

      if (upd2?.error && !isMissingTableOrColumnError(upd2.error.message)) {
        console.error("reset: business_profiles minimal update failed", upd2.error);
      }
      return;
    }

    console.error("reset: business_profiles update failed", upd.error);
  } catch (e) {
    console.error("reset: business_profiles update threw", e);
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
     * IMPORTANT — RESET "SOFT" (ONBOARDING)
     * - ✅ On supprime uniquement les données générées / contenus / tâches / stratégie / onboarding
     * - ❌ On ne touche PAS au plan, aux crédits IA, ni aux infos de compte (profiles, email, etc.)
     *
     * Donc : pas de RPC "reset_user" ici (trop risqué si elle évolue côté DB).
     */

    const deletions: Array<{ table: string; column?: string }> = [
      // Onboarding V2 (sessions/messages/facts) — regénérable
      { table: "onboarding_messages", column: "user_id" }, // si table a user_id (best-effort)
      { table: "onboarding_facts", column: "user_id" }, // best-effort
      { table: "onboarding_sessions", column: "user_id" },

      // Onboarding / stratégie / pyramides / persona / plan business (regénérables)
      { table: "offer_pyramids", column: "user_id" },
      { table: "personas", column: "user_id" },
      { table: "strategies", column: "user_id" },
      { table: "strategy_goals", column: "user_id" },
      { table: "business_plan", column: "user_id" },

      // Contenus / calendriers / tâches (regénérables)
      { table: "content_item", column: "user_id" },
      { table: "content_items", column: "user_id" },
      { table: "contents", column: "user_id" },
      { table: "generated_contents", column: "user_id" },
      { table: "posts", column: "user_id" },
      { table: "project_tasks", column: "user_id" },
      { table: "tasks", column: "user_id" },
      { table: "todos", column: "user_id" },
      { table: "calendar_events", column: "user_id" },

      // Analytics / events (recalculables)
      { table: "metrics", column: "user_id" },
      { table: "analytics_events", column: "user_id" },

      // Ressources / base de connaissances (recréables)
      { table: "resources", column: "user_id" },
      { table: "resource_chunks", column: "user_id" },

      // Prompts & blocks (réglages de contenu / templates utilisateur)
      { table: "prompts", column: "user_id" },
      { table: "business_blocks", column: "user_id" },
    ];

    for (const d of deletions) {
      await bestEffortDeleteByUserId(supabase, d.table, userId, d.column ?? "user_id");
    }

    // Fallback owner_id (certaines tables historiques peuvent utiliser owner_id)
    const ownerTables = [
      "contents",
      "content_items",
      "content_item",
      "tasks",
      "todos",
      "posts",
      "project_tasks",
      "resources",
      "prompts",
      "business_plan",
      "strategies",
      "personas",
      "offer_pyramids",
      "onboarding_sessions",
      "onboarding_facts",
      "onboarding_messages",
    ];
    for (const t of ownerTables) {
      await bestEffortDeleteByUserId(supabase, t, userId, "owner_id");
    }

    // ✅ Reset onboarding : ne pas rester bloqué sur /app
    // (DELETE si possible, sinon UPDATE onboarding_completed=false)
    await bestEffortResetBusinessProfile(supabase, userId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in POST /api/account/reset:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
