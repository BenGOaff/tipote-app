// app/auth/callback/page.tsx
// Wrapper server pour éviter l'erreur Next "useSearchParams should be wrapped in a suspense boundary".
// Le vrai handler est dans CallbackClient.tsx (client).

import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";

function LoadingUI() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">Connexion en cours…</h1>
        <p className="text-sm text-slate-400">
          On finalise ton accès à Tipote. Tu vas être redirigée automatiquement.
        </p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <CallbackClient />
    </Suspense>
  );
}
