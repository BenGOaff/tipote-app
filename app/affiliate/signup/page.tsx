// app/affiliate/signup/page.tsx
//
// Page d'inscription/activation pour les affiliés. Conçue pour être
// linkée depuis Systeme.io via merge tags :
//
//   https://affiliate.tipote.com/signup?sa={affiliate_id}&email={contact_email}&first_name={first_name}
//
// L'user arrive avec ses infos pré-remplies (mais éditables au cas où
// quelque chose serait à corriger). Il confirme → on l'ajoute en
// status='active' dans la table affiliates + on lui envoie un magic
// link pour accéder à son dashboard.
//
// Sécurité : on vérifie côté serveur que l'email existe bien comme
// contact Systeme.io avant d'activer. Empêche un visiteur d'inscrire
// n'importe quel sa avec un email random.

import { Suspense } from "react";
import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

function LoadingUI() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-slate-400">Chargement…</div>
    </div>
  );
}

export default function AffiliateSignupPage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <SignupClient />
    </Suspense>
  );
}
