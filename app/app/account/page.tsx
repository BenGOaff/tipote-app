// app/app/account/page.tsx
// Rôle : page compte utilisateur, avec un bloc changement de mot de passe.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
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
    <main className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header simple, cohérent avec /app */}
      <header className="border-b border-slate-800 bg-slate-950/80">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-emerald-500/90 flex items-center justify-center text-xs font-bold text-slate-950">
              T
            </div>
            <div>
              <p className="text-sm font-semibold">Tipote</p>
              <p className="text-xs text-slate-400">Mon compte</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 hidden sm:inline">
              {userEmail}
            </span>
            <a
              href="/app"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Retour à l&apos;app
            </a>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <div className="max-w-5xl mx-auto py-10 px-4 space-y-8">
        <section className="space-y-1">
          <h1 className="text-2xl font-semibold">Mon compte</h1>
          <p className="text-sm text-slate-400">
            Email : <span className="font-medium text-slate-200">{userEmail}</span>
          </p>
        </section>

        <section className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Sécurité</h2>
          <p className="text-sm text-slate-400">
            Tu peux mettre à jour ton mot de passe. Tu seras automatiquement
            connecté avec le nouveau.
          </p>
          <SetPasswordForm mode="reset" />
        </section>
      </div>
    </main>
  );
}
