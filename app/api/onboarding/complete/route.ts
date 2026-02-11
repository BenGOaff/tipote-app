// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (business_profiles.onboarding_completed)
// V2: also sets onboarding_version="v2" (routing) + optional diagnostic_completed
// Best-effort: also closes onboarding_sessions if sessionId provided (fail-open on schema diffs)
//
// ✅ PATCH (suite logique onboarding 3.0) :
// - Fix boucle /onboarding si business_profiles row n'existe pas encore : update THEN insert (fail-open)
// - Conserve la compat colonne onboarding_version (si absente, retry sans)
// - Ne casse rien : aucune nouvelle route, aucun changement front requis
//
// ✅ MULTI-PROJETS : accepte `project_id` dans le body pour scoper l'onboarding au projet actif.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectIdFromRequest } from "@/lib/projects/activeProject";

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
  );
}

async function updateThenInsertBusinessProfile(
  supabase: any,
  userId: string,
  patch: Record<string, unknown>,
  projectId?: string | null,
) {
  const now = new Date().toISOString();

  // On garde l'update d'abord (anti-régression)
  let updQuery = supabase
    .from("business_profiles")
    .update({ ...patch, updated_at: now } as any)
    .eq("user_id", userId);

  // Si un project_id est fourni, scoper l'update
  if (projectId) {
    updQuery = updQuery.eq("project_id", projectId);
  }

  const upd = await updQuery.select("id");

  if (!upd.error) {
    if (Array.isArray(upd.data) && upd.data.length > 0) return { ok: true, error: null as any };
  }

  // Si erreur "colonne manquante", on laisse caller gérer (retry sans colonne).
  if (upd.error && isMissingColumnError(upd.error.message)) {
    return { ok: false, error: upd.error };
  }

  // Si 0 row (ou autre cas), insert best-effort
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    ...patch,
    created_at: now,
    updated_at: now,
  };
  if (projectId) insertPayload.project_id = projectId;

  const ins = await supabase.from("business_profiles").insert(insertPayload as any);

  if (ins.error && isMissingColumnError(ins.error.message)) {
    // On retente sans created_at/updated_at si jamais ces colonnes diffèrent (fail-open)
    const retryPayload: Record<string, unknown> = { user_id: userId, ...patch };
    if (projectId) retryPayload.project_id = projectId;

    const ins2 = await supabase.from("business_profiles").insert(retryPayload as any);
    return { ok: !ins2.error, error: ins2.error };
  }

  return { ok: !ins.error, error: ins.error };
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      diagnosticCompleted?: boolean;
      diagnostic_completed?: boolean; // compat
      sessionId?: string;
      project_id?: string; // multi-projets
    };

    const diagnosticCompleted = !!(body?.diagnosticCompleted ?? (body as any)?.diagnostic_completed);

    // ✅ Résoudre le project_id (body > cookie > default)
    let projectId: string | null = typeof body?.project_id === "string" ? body.project_id.trim() : "";
    if (!projectId) {
      projectId = await getActiveProjectIdFromRequest(supabase, userId, req as any);
    }

    // 1) business_profiles = source de vérité UI
    // (fail-open si la colonne onboarding_version n'existe pas encore)
    const patch: Record<string, unknown> = {
      onboarding_completed: true,
      onboarding_version: "v2",
    };
    if (diagnosticCompleted) patch.diagnostic_completed = true;

    const r1 = await updateThenInsertBusinessProfile(supabase, userId, patch, projectId);

    if (!r1.ok && r1.error && isMissingColumnError(r1.error.message)) {
      // Retry sans onboarding_version si colonne absente
      const patch2: Record<string, unknown> = { onboarding_completed: true };
      if (diagnosticCompleted) patch2.diagnostic_completed = true;

      const r2 = await updateThenInsertBusinessProfile(supabase, userId, patch2, projectId);
      if (!r2.ok) {
        return NextResponse.json({ ok: false, error: r2.error?.message ?? "Failed to complete onboarding" }, { status: 400 });
      }
    } else if (!r1.ok) {
      return NextResponse.json({ ok: false, error: r1.error?.message ?? "Failed to complete onboarding" }, { status: 400 });
    }

    // 2) best-effort: fermer la session si fournie (ne jamais casser si schema différent)
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (sessionId) {
      // Try with completed_at if present, else fallback
      const withCompletedAt = await supabase
        .from("onboarding_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (withCompletedAt.error && isMissingColumnError(withCompletedAt.error.message)) {
        await supabase
          .from("onboarding_sessions")
          .update({ status: "completed" } as any)
          .eq("id", sessionId)
          .eq("user_id", userId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
