// app/app/page.tsx
// Rôle : vue d’ensemble (dashboard) protégée, utilise AppShell.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';

export default async function AppPage() {
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
          Vue d’ensemble
        </h1>
        <p className="text-sm text-slate-500">
          Ici on affichera ton état global : projets, blocks business,
          automations en cours, etc.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Blocks business
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Bientôt : la liste de tes blocks, leur statut, et les prochaines
            actions recommandées.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Automatisations
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Bientôt : les workflows n8n reliés à Systeme.io et à tes blocks
            Tipote.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
