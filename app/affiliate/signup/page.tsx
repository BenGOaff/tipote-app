// app/affiliate/signup/page.tsx
//
// Page d'inscription pour les affiliés, avec OU SANS compte Systeme.io.
//
// Elle peut être linkée depuis Systeme.io via merge tags :
//
//   https://affiliate.tipote.com/signup?sa={affiliate_id}&email={contact_email}&first_name={first_name}
//
// L'user arrive alors avec ses infos pré-remplies (mais éditables au cas
// où quelque chose serait à corriger). Elle est AUSSI accessible en
// direct depuis l'écran de connexion, depuis le 25 août 2026 : Béné,
// "pourquoi un type sans systeme io ne pourrait pas devenir affilié chez
// nous ??". Le champ identifiant y est facultatif.
//
// Il confirme -> on l'ajoute en status='active' dans la table affiliates
// + on lui envoie un magic link pour accéder à son dashboard.
//
// CE COMMENTAIRE A DIT LE CONTRAIRE DU CODE PENDANT DES MOIS : il
// annonçait qu'on vérifiait l'email auprès de Systeme.io avant
// d'activer. La route ne l'a jamais fait, et c'est assumé depuis le 14
// juillet 2026 (Béné : "on s'en fout de l'email Systeme.io, c'est l'ID
// qui est important"). Une règle écrite en commentaire n'est pas une
// règle, et un commentaire qui décrit une sécurité inexistante est pire
// qu'une absence de commentaire.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

function LoadingUI() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-slate-400">Chargement…</div>
    </div>
  );
}

export default async function AffiliateSignupPage() {
  // Déjà connecté → déjà affilié : pas d'écran d'inscription, et pas de
  // sidebar (le layout l'ajoute dès qu'une session existe). On renvoie
  // vers le dashboard.
  const session = await getAffiliateSession();
  if (session) redirect("/");

  return (
    <Suspense fallback={<LoadingUI />}>
      <SignupClient />
    </Suspense>
  );
}
