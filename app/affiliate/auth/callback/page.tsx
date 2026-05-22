// app/affiliate/auth/callback/page.tsx
//
// Callback du magic link Supabase pour le dashboard affilié.
// Le flow :
//   1. Affilié clique sur magic link reçu par email
//   2. Browser → Supabase verify URL → cette page (avec code/hash dans URL)
//   3. Client-side : on échange le code contre une session Supabase
//   4. On call /affiliate/api/auth/verify qui check si l'email est un
//      affilié actif. Si oui → redirect /affiliate. Si non → signOut +
//      redirect /affiliate/login?error=not_affiliate

import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";

function LoadingUI() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-slate-300">Validation en cours…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <CallbackClient />
    </Suspense>
  );
}
