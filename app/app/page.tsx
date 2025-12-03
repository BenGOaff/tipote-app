// app/app/page.tsx
// Rôle : espace Tipote protégé (accessible seulement si session Supabase).

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export default async function AppPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Pas de session → retour à la page de login
    redirect('/');
  }

  // Pour l'instant on affiche juste un placeholder simple.
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-4xl mx-auto py-10 px-4 space-y-4">
        <h1 className="text-2xl font-semibold">Espace Tipote</h1>
        <p className="text-sm text-slate-400">
          Tu es connecté à Tipote. On remplira cette page avec le vrai contenu
          (blocks business, plans, etc.) plus tard.
        </p>
      </div>
    </main>
  );
}
