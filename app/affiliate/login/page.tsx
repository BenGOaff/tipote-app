// app/affiliate/login/page.tsx
// Page de connexion à l'espace affilié — design Tipote (mêmes
// composants UI que la page de connexion principale, avec deux modes :
// mot de passe ou lien magique).

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import LoginAffiliateForm from "./LoginAffiliateForm";

export const dynamic = "force-dynamic";

export default async function AffiliateLoginPage() {
  // Un affilié déjà connecté n'a rien à faire sur l'écran de connexion :
  // on le renvoie sur son dashboard. Évite aussi d'afficher la sidebar
  // (le layout l'ajoute dès qu'une session existe) sur une page qui doit
  // rester un écran de connexion plein écran.
  const session = await getAffiliateSession();
  if (session) redirect("/");

  return (
    <Suspense fallback={null}>
      <LoginAffiliateForm />
    </Suspense>
  );
}
