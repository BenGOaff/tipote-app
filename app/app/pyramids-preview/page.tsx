// app/app/pyramids-preview/page.tsx
// Page utilitaire de test (preview) pour vérifier l'affichage / qualité des pyramides
// - Accessible depuis /app/... donc ne dépend pas des guards de /strategy
// - Protégée par auth Supabase
// - Ne redirige jamais vers /strategy/pyramids
// - Réutilise le composant existant PyramidSelection (pixel perfect)

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

// Réutilisation directe du composant existant
import PyramidSelection from "@/app/strategy/pyramids/PyramidSelection";

export default async function PyramidsPreviewPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  // On ne met AUCUNE logique de redirection ici.
  // Même si une pyramide est déjà sélectionnée, on veut pouvoir revoir l'UI.
  return <PyramidSelection />;
}
