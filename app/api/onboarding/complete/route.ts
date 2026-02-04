// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (business_profiles.onboarding_completed)
// V2: also sets onboarding_version="v2" (routing) + optional diagnostic_completed
// Best-effort: also closes onboarding_sessions if sessionId provided (fail-open on schema diffs)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

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
    };

    const diagnosticCompleted = !!(body?.diagnosticCompleted ?? (body as any)?.diagnostic_completed);

    // 1) business_profiles = source de vérité UI
    // (fail-open si la colonne onboarding_version n'existe pas encore)
    const patch: Record<string, unknown> = {
      onboarding_completed: true,
      onboarding_version: "v2",
    };
    if (diagnosticCompleted) patch.diagnostic_completed = true;

    const upd = await supabase.from("business_profiles").update(patch as any).eq("user_id", userId);

    if (upd.error && isMissingColumnError(upd.error.message)) {
      // Retry sans onboarding_version si colonne absente
      const patch2: Record<string, unknown> = { onboarding_completed: true };
      if (diagnosticCompleted) patch2.diagnostic_completed = true;

      const upd2 = await supabase.from("business_profiles").update(patch2 as any).eq("user_id", userId);
      if (upd2.error) {
        return NextResponse.json({ ok: false, error: upd2.error.message }, { status: 400 });
      }
    } else if (upd.error) {
      return NextResponse.json({ ok: false, error: upd.error.message }, { status: 400 });
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
