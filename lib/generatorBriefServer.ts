// lib/generatorBriefServer.ts
//
// Lecture du brief retenu depuis un composant serveur, pour pré-remplir
// les champs DÈS le premier rendu. Un fetch côté client afficherait des
// champs vides une fraction de seconde puis les remplirait : on croirait
// que le formulaire se remplit tout seul sous les doigts.
//
// Fail-open partout : pas de session, table absente en prod, erreur
// réseau -> brief vide, le générateur marche comme avant.

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeBrief, type BriefScope, type GeneratorBrief } from "@/lib/generatorBrief";

export async function loadBrief(scope: BriefScope): Promise<GeneratorBrief> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};
    const { data } = await supabase
      .from("generator_briefs")
      .select("brief")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle();
    return sanitizeBrief(data?.brief);
  } catch {
    return {};
  }
}
