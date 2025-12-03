// app/auth/reset-password/page.tsx
// Rôle : page pour définir un nouveau mot de passe après lien de reset.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import SetPasswordForm from '@/components/SetPasswordForm';

export default async function ResetPasswordPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/?auth_error=not_authenticated');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-slate-50 mb-2">
          Définir un nouveau mot de passe
        </h1>
        <p className="text-sm text-slate-400 mb-4">
          Choisis un nouveau mot de passe pour ton compte Tipote.
        </p>
        <SetPasswordForm mode="reset" />
      </div>
    </main>
  );
}
