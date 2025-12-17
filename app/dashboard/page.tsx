import { redirect } from "next/navigation";

// Route legacy /dashboard : sortie simple vers l'app.
// (On n'utilise pas `profiles.onboarding_done` car la colonne n'existe pas dans le schéma actuel.)
export default async function DashboardRedirect() {
  redirect("/app");
}
