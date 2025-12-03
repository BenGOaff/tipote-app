// components/SetPasswordForm.tsx
// Rôle : formulaire pour définir / redéfinir un mot de passe.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type SetPasswordFormProps = {
  mode: 'first' | 'reset';
};

export default function SetPasswordForm({ mode }: SetPasswordFormProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || !passwordConfirm) {
      setErrorMsg('Merci de remplir les deux champs.');
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);

    try {
      // 1) Mettre à jour le mot de passe Supabase
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        console.error('[SetPasswordForm] updateUser error', updateError);
        setErrorMsg('Impossible de mettre à jour le mot de passe.');
        setLoading(false);
        return;
      }

      // 2) Récupérer l'utilisateur pour mettre à jour le profil
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('[SetPasswordForm] getUser error', userError);
        // on ne bloque pas : le mot de passe est déjà mis à jour
      } else {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            password_set_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileError) {
          console.error('[SetPasswordForm] update profiles error', profileError);
        }
      }

      setSuccessMsg(
        mode === 'first'
          ? 'Mot de passe créé. Redirection vers ton espace...'
          : 'Mot de passe mis à jour. Redirection vers ton espace...',
      );

      setTimeout(() => {
        router.push('/app');
      }, 1000);
    } catch (err) {
      console.error('[SetPasswordForm] unexpected error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-200">
          Nouveau mot de passe
        </label>
        <input
          type="password"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-200">
          Confirmer le mot de passe
        </label>
        <input
          type="password"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      {errorMsg && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
          {errorMsg}
        </p>
      )}
      {successMsg && (
        <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
          {successMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-950 py-2 transition-colors"
      >
        {loading
          ? 'Enregistrement...'
          : mode === 'first'
          ? 'Créer mon mot de passe'
          : 'Mettre à jour mon mot de passe'}
      </button>
    </form>
  );
}
