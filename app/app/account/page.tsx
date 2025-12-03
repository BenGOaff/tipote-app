// app/app/account/page.tsx
// Rôle : page compte utilisateur, changement de mot de passe, réutilise AppShell.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';
import SetPasswordForm from '@/components/SetPasswordForm';

export default async function AccountPage() {
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
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Mon compte</h1>
        <p className="text-sm text-slate-500">
          Email :{' '}
          <span className="font-medium text-slate-900">{userEmail}</span>
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Sécurité & mot de passe
        </h2>
        <p className="text-sm text-slate-500">
          Tu peux mettre à jour ton mot de passe. Tu seras automatiquement
          connecté avec le nouveau.
        </p>
        <SetPasswordForm mode="reset" />
      </section>
    </AppShell>
  );
}
