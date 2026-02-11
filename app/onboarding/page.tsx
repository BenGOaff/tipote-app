// app/onboarding/page.tsx
// Onboarding (obligatoire)
// ✅ V2 (chat) uniquement (legacy supprimé)
// Si déjà complété => redirection dashboard principal
//
// ✅ Reprise de session (resume) si une session onboarding v2 est active
// (fail-open si tables absentes ou erreurs DB, pour ne pas casser l'app)
//
// ✅ MULTI-PROJETS : l'onboarding est scoped au projet actif (cookie tipote_active_project).
// Si le projet actif n'a pas encore de business_profiles row, c'est un nouveau projet.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { OnboardingChatV2 } from "./OnboardingChatV2";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

type InitialMsg = {
  role: "assistant" | "user";
  content: string;
  at: string;
};

function isInitialMsg(x: any): x is InitialMsg {
  return (
    x &&
    (x.role === "user" || x.role === "assistant") &&
    typeof x.content === "string" &&
    x.content.trim().length > 0 &&
    typeof x.at === "string"
  );
}

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // ✅ La page login est "/" dans ce repo
  if (userError || !user) redirect("/");

  // ✅ Récupérer le project_id actif depuis le cookie
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

  // Vérifier l'onboarding pour le projet actif
  let profile: { onboarding_completed: boolean; first_name: string | null } | null = null;

  if (activeProjectId) {
    // Chercher le business_profiles pour ce projet spécifique
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, first_name")
      .eq("user_id", user.id)
      .eq("project_id", activeProjectId)
      .maybeSingle();

    if (data) {
      profile = data;
    }
  }

  // Fallback : chercher par user_id seul (ancien comportement / compat migration)
  if (!profile) {
    const { data } = await supabase
      .from("business_profiles")
      .select("onboarding_completed, first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    profile = data;
  }

  if (profile?.onboarding_completed) redirect("/app");

  // ✅ Resume session v2 si existante (best-effort)
  let initialSessionId: string | null = null;
  let initialMessages: InitialMsg[] | null = null;

  try {
    // Chercher la session pour le projet actif d'abord
    let sessQuery = supabase
      .from("onboarding_sessions")
      .select("id,status,started_at,onboarding_version")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (activeProjectId) {
      sessQuery = sessQuery.eq("project_id", activeProjectId);
    }

    const { data: sess } = await sessQuery
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sess?.id) {
      initialSessionId = String(sess.id);

      const { data: msgs } = await supabase
        .from("onboarding_messages")
        .select("role,content,created_at")
        .eq("session_id", initialSessionId)
        .order("created_at", { ascending: true })
        .limit(60);

      if (Array.isArray(msgs) && msgs.length > 0) {
        const mapped: InitialMsg[] = msgs.map((m: any) => {
          const role: InitialMsg["role"] = m?.role === "user" ? "user" : "assistant";
          return {
            role,
            content: String(m?.content ?? ""),
            at: String(m?.created_at ?? new Date().toISOString()),
          };
        });

        initialMessages = mapped.filter(isInitialMsg);
      }
    }
  } catch {
    // fail-open : pas de reprise si erreur
  }

  return (
    <OnboardingChatV2
      firstName={profile?.first_name ?? null}
      initialSessionId={initialSessionId}
      initialMessages={initialMessages ?? undefined}
    />
  );
}
