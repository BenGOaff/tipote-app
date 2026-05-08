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

  // Onboarding status — scoped to the active project.
  //
  // Bug Monique 2026-05-04 : un fallback "any project completed" sautait
  // l'onboarding du 2e projet d'un user dès que son 1er projet l'avait
  // complété. On vérifie *uniquement* le projet actif, mais on ajoute
  // une heuristique permissive : si la row a déjà du contenu réel
  // (niche + au moins une offre), on considère que l'user est sorti
  // de l'onboarding même si le flag n'a jamais été flippé. Backfill
  // silencieux du flag pour que la check soit propre la prochaine fois.
  //
  // Bug Flo 2026-05-08 : 70 contenus créés, niche + 3 offres saisies,
  // mais onboarding_completed resté à false → redirigée sur l'onboarding
  // à chaque login. L'heuristique ci-dessous la libère sans toucher
  // au flow d'onboarding nominal.
  let onboardingCompleted = false;

  if (activeProjectId) {
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, niche, offers")
      .eq("user_id", userId)
      .eq("project_id", activeProjectId)
      .maybeSingle();

    const flagged = data?.onboarding_completed === true;
    const hasNiche = !!data?.niche?.toString().trim();
    const offersArr = Array.isArray(data?.offers) ? data!.offers : [];
    const hasOffer = offersArr.length > 0;
    const looksOnboarded = hasNiche && hasOffer;

    onboardingCompleted = flagged || looksOnboarded;

    // Backfill the flag if the heuristic kicked in — keeps the DB
    // consistent and avoids re-running the heuristic on every visit.
    if (!flagged && looksOnboarded) {
      void supabase
        .from("business_profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", userId)
        .eq("project_id", activeProjectId);
    }
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
