// app/compta/page.tsx
//
// Page "Compta" — wrapper server minimal qui :
//   1. récupère le user + son projet actif
//   2. lit `business_profiles.country` (rempli à l'onboarding ou laissé vide)
//   3. délègue au composant client qui décide quel écran afficher :
//        - pas de country renseignée → mini sélecteur "Tu vis dans quel pays ?"
//        - country = France (avec synonymes) → vraie UI compta (pour l'instant un placeholder, livré en sous-commits 1b → 1e)
//        - country ≠ France → message "bientôt dispo pour [pays]"
//
// Le pays est stocké en clair dans business_profiles.country (snake_case)
// — on réutilise le champ existant rempli à l'onboarding, pas de
// nouvelle table.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import ComptaPageClient from "./ComptaPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compta — Tipote" };

export default async function ComptaPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compta");

  const projectId = await getActiveProjectId(supabase, user.id);

  // Lecture côté admin pour bypass RLS et garantir que le gating
  // marche même si l'user n'a pas encore de project_id (cas rare
  // pour des comptes très anciens).
  let bpQuery = supabaseAdmin
    .from("business_profiles")
    .select("country")
    .eq("user_id", user.id);
  if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
  const { data: bp } = await bpQuery.maybeSingle();

  const country = (bp as { country?: string | null } | null)?.country ?? null;

  return <ComptaPageClient initialCountry={country} />;
}
