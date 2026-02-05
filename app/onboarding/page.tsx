// app/onboarding/page.tsx
// Onboarding (obligatoire)
// V2 (chat) par défaut. Legacy accessible via ?legacy=1
// Si déjà complété => redirection dashboard principal
//
// ✅ V2: reprise de session (resume) si une session onboarding v2 est active
// (fail-open si tables absentes ou erreurs DB, pour ne pas casser l'app)

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingChatV2 } from "./OnboardingChatV2";

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

export default async function OnboardingPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // ✅ La page login est "/" dans ce repo
  if (userError || !user) redirect("/");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("onboarding_completed, first_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) redirect("/app");

  const legacyParam = props.searchParams?.legacy;
  const legacy = legacyParam === "1" || (Array.isArray(legacyParam) && legacyParam.includes("1"));

  if (legacy) return <OnboardingFlow />;

  // ✅ Resume session v2 si existante (best-effort)
  let initialSessionId: string | null = null;
  let initialMessages: InitialMsg[] | null = null;

  try {
    const { data: sess } = await supabase
      .from("onboarding_sessions")
      .select("id,status,started_at,onboarding_version")
      .eq("user_id", user.id)
      .eq("status", "active")
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
