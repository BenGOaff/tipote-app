// app/onboarding/page.tsx
// Onboarding (obligatoire) — Typeform-style questionnaire (V3)
// ✅ Remplace le chat V2 par un questionnaire structuré
// ✅ Auto-creates default project for beta users who don't have one
// ✅ MULTI-PROJETS: scoped to active project (cookie)

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureDefaultProject } from "@/lib/projects/ensureDefaultProject";
import { OnboardingQuestionnaire } from "./OnboardingQuestionnaire";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/");

  // ✅ Auto-create default project for beta users (self-healing)
  const cookieStore = await cookies();
  let activeProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

  if (!activeProjectId) {
    // Try to find or create a project for this user
    try {
      const { data: existingProject } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingProject?.id) {
        activeProjectId = existingProject.id;
      } else {
        // Create default project using admin (bypasses RLS)
        const newId = await ensureDefaultProject(user.id);
        if (newId) activeProjectId = newId;
      }
    } catch {
      // fail-open
    }
  }

  // Check if onboarding already completed for the active project
  let isCompleted = false;
  let firstName: string | null = null;

  if (activeProjectId) {
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, first_name")
      .eq("user_id", user.id)
      .eq("project_id", activeProjectId)
      .maybeSingle();

    if (data) {
      isCompleted = data.onboarding_completed === true;
      firstName = data.first_name ?? null;
    }
  }

  // Fallback: check by user_id only (compat for beta users)
  if (!isCompleted && !firstName) {
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      isCompleted = data.onboarding_completed === true;
      firstName = data.first_name ?? null;
    }
  }

  if (isCompleted) redirect("/app");

  return <OnboardingQuestionnaire firstName={firstName} />;
}
