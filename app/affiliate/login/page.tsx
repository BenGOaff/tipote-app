// app/affiliate/login/page.tsx
// Page de connexion à l'espace affilié — design Tipote (mêmes
// composants UI que la page de connexion principale, avec deux modes :
// mot de passe ou lien magique).

import { Suspense } from "react";
import LoginAffiliateForm from "./LoginAffiliateForm";

export const dynamic = "force-dynamic";

export default function AffiliateLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginAffiliateForm />
    </Suspense>
  );
}
