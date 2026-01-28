// components/SetPasswordForm.tsx
// Rôle : formulaire pour définir / redéfinir un mot de passe.
//
// Flow souhaité (Béné) :
// - invite -> définir mdp -> retour page connexion -> login email+mdp -> onboarding
// Donc après updateUser(password), on signOut puis redirect vers "/".

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

      // 2) Best-effort: marquer "password_set_at" si la table profiles existe
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!userError && user?.id) {
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
      } catch (e2) {
        console.error('[SetPasswordForm] profiles best-effort catch', e2);
      }

      setSuccessMsg(
        mode === 'first'
          ? 'Mot de passe créé. Tu peux maintenant te connecter.'
          : 'Mot de passe mis à jour. Tu peux maintenant te connecter.',
      );

      // 3) Important : on déconnecte et on renvoie vers la page login (flow Béné)
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      setTimeout(() => {
        router.push('/?password_set=1');
      }, 700);
    } catch (err) {
      console.error('[SetPasswordForm] unexpected error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'reset' ? 'Réinitialise ton mot de passe' : 'Crée ton mot de passe';
  const subtitle =
    mode === 'reset'
      ? 'Choisis un nouveau mot de passe pour te reconnecter.'
      : 'C’est ta première connexion à Tipote. Choisis un mot de passe pour les prochaines fois.';

  return (
    <div className="space-y-5">
      {/* Header brandé Tipote (sans toucher au flow) */}
      <div className="text-center space-y-2">
        <div className="text-3xl font-bold tracking-tight text-slate-50">
          Tipote<span className="text-indigo-400">™</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
          <p className="text-sm text-slate-300">{subtitle}</p>
        </div>
      </div>

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
          className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? 'En cours…' : 'Valider le mot de passe'}
        </button>
      </form>
    </div>
  );
}
