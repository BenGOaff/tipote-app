// app/auth/set-password/page.tsx
// Rôle : page où l'utilisateur définit son mot de passe à la première connexion.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import SetPasswordForm from '@/components/SetPasswordForm';

export default async function SetPasswordPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/?auth_error=not_authenticated');
  }

  // On vérifie si le mot de passe est déjà défini
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('password_set_at')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('[set-password] profiles select error', error);
  }

  if (profile?.password_set_at) {
    // Mot de passe déjà défini → pas besoin de rester ici.
    redirect('/app');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">
          Crée ton mot de passe
        </h1>
        <p className="text-sm text-slate-400 mb-4">
          C’est la première fois que tu te connectes à Tipote. Choisis un mot de
          passe pour tes prochaines connexions.
        </p>
        <SetPasswordForm mode="first" />
      </div>
    </main>
  );
}
