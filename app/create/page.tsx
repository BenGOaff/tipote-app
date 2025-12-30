// app/create/page.tsx
// Hub création (Lovable) : sélection du type + templates + génération dans la même page.
// Objectif : supprimer le blocage de navigation observé (page /create) en adoptant la logique Lovable.

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { CreateHub } from "@/components/create/CreateHub";

export default async function CreatePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  // 🔎 Contexte pour pré-remplir le brief (fail-open)
  let profileRow: any | null = null;
  let planRow: any | null = null;

  try {
    const { data } = await supabase
      .from("business_profiles")
      .select(
        "business_name, nom_entreprise, audience, cible, offer, offre, goals, objectifs, tone, tonalite, tone_preference",
      )
      .eq("user_id", session.user.id)
      .maybeSingle();
    profileRow = data ?? null;
  } catch {
    profileRow = null;
  }

  try {
    const { data } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", session.user.id)
      .maybeSingle();
    planRow = data ?? null;
  } catch {
    planRow = null;
  }

  return (
    <AppShell userEmail={userEmail} headerTitle="Créer">
      <CreateHub profile={profileRow} plan={planRow} />
    </AppShell>
  );
}
