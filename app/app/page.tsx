// app/app/page.tsx
// Dashboard "Aujourd'hui" — rendu pixel-perfect Lovable (Today.tsx)
// - Protégé par l'auth Supabase
// - Si onboarding non complété => redirect /onboarding
// NOTE: on NE bloque plus sur la stratégie/offres ici.
// L'utilisateur arrive sur un dashboard immédiatement.
//
// ✅ Suite logique Onboarding 3.0 : la finalisation (offres + stratégie + tâches) se fait dans l'onboarding,
// puis redirect vers /app. On garde /app clean (pas de bandeau / nudge post-onboarding).

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import TodayLovable from "@/components/dashboard/TodayLovable";
import StrategyAutoBootstrap from "@/components/strategy/StrategyAutoBootstrap";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/");

  const userId = user.id;
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

  // Onboarding status — STRICTLY scoped to the active project.
  //
  // Bug Monique 2026-05-04 : un fallback "any project completed" sautait
  // l'onboarding du 2e projet d'un user dès que son 1er projet l'avait
  // complété. Nouveau comportement : si on a un projet actif, on vérifie
  // *uniquement* ce projet ; le fallback ne sert qu'aux vieux comptes
  // sans cookie de projet actif (legacy single-project).
  let onboardingCompleted = false;

  if (activeProjectId) {
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .eq("project_id", activeProjectId)
      .maybeSingle();

    onboardingCompleted = data?.onboarding_completed === true;
  } else {
    // Pas de projet actif (compte créé avant le multi-projet, ou cookie
    // expiré) → on prend la première ligne complétée pour ne pas
    // bloquer l'accès dashboard d'un user existant.
    const { data: rows } = await supabase
      .from("business_profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .eq("onboarding_completed", true)
      .limit(1);

    if (rows && rows.length > 0) onboardingCompleted = true;
  }

  if (!onboardingCompleted) redirect("/onboarding");

  return (
    <>
      <StrategyAutoBootstrap />
      <TodayLovable />
    </>
  );
}
