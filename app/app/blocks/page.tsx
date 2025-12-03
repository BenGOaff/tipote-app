// app/app/blocks/page.tsx
// Rôle : placeholder "Blocks business", protégé, dans AppShell.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';

export default async function BlocksPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  const userEmail = session.user.email ?? 'Utilisateur';

  return (
    <AppShell userEmail={userEmail}>
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          Blocks business
        </h1>
        <p className="text-sm text-slate-500">
          Ici on construira la vue principale de tes blocks business (structure,
          objectifs, KPIs, etc.).
        </p>
      </section>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Placeholder : on ajoutera bientôt la vraie liste des blocks.
      </div>
    </AppShell>
  );
}
