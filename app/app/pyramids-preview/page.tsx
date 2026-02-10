// app/app/pyramids-preview/page.tsx
// Page utilitaire de test (preview) pour verifier l'affichage / qualite des offres
// - Accessible depuis /app/... donc ne depend pas des guards de /strategy
// - Protegee par auth Supabase
// - Ne redirige jamais vers /strategy/pyramids
// - Reutilise le composant existant PyramidSelection (pixel perfect)

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
  // Meme si des offres sont deja selectionnees, on veut pouvoir revoir l'UI.
  return <PyramidSelection />;
}
