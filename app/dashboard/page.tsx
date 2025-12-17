import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

// Backward-compatible route: older UI links to /dashboard.
// We also treat it as an explicit "Quitter l'onboarding" shortcut:
// - mark `profiles.onboarding_done = true` (best-effort)
// - redirect to /app
export default async function DashboardRedirect() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    const now = new Date().toISOString();

    // Best-effort (schema may or may not include onboarding_done_at)
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: session.user.id, onboarding_done: true, onboarding_done_at: now, updated_at: now },
        { onConflict: "id" },
      );

    if (error) {
      await supabase
        .from("profiles")
        .upsert({ id: session.user.id, onboarding_done: true, updated_at: now }, { onConflict: "id" });
    }
  }

  redirect("/app");
}
