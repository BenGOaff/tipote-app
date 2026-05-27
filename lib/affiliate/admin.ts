// Gating admin pour la gestion des contenus affiliés (Béné = owner).
// Indépendant du statut "affilié actif" : on autorise sur l'email Supabase
// présent dans la liste ADMIN_EMAILS (cf. lib/adminEmails).

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isAdminEmail } from "@/lib/adminEmails";

/** Renvoie l'email (normalisé) si l'utilisateur connecté est admin, sinon null. */
export async function getAffiliateAdmin(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;
  return isAdminEmail(email) ? email : null;
}
