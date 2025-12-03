// components/LoginForm.tsx
// Rôle : page de connexion Tipote (email + mot de passe + lien magique).

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tipote.com';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  // --- Etat pour login par mot de passe ---
  const [emailPassword, setEmailPassword] = useState('');
  const [password, setPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  // --- Etat pour login par lien magique ---
  const [emailMagic, setEmailMagic] = useState('');
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [errorMagic, setErrorMagic] = useState<string | null>(null);
  const [successMagic, setSuccessMagic] = useState<string | null>(null);

  // --- Message d'erreur global venant du callback ---
  const authError = searchParams.get('auth_error');

  const bannerMessage =
    authError === 'missing_code'
      ? 'Lien de connexion invalide. Merci de recommencer.'
      : authError === 'invalid_code'
      ? 'Lien de connexion invalide ou expiré. Merci de recommencer.'
      : authError === 'unexpected'
      ? 'Erreur de connexion. Merci de réessayer.'
      : authError === 'not_authenticated'
      ? 'Tu dois être connecté pour accéder à cette page.'
      : null;

  // --- Submit : login par mot de passe ---
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorPassword(null);

    if (!emailPassword || !password) {
      setErrorPassword('Merci de remplir ton email et ton mot de passe.');
      return;
    }

    setLoadingPassword(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailPassword,
        password,
      });

      if (error) {
        console.error('[LoginForm] signInWithPassword error', error);
        setErrorPassword('Email ou mot de passe incorrect.');
        setLoadingPassword(false);
        return;
      }

      router.push('/app');
    } catch (err) {
      console.error('[LoginForm] unexpected error (password login)', err);
      setErrorPassword('Erreur inattendue. Merci de réessayer.');
      setLoadingPassword(false);
    }
  }

  // --- Submit : envoi du lien magique ---
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMagic(null);
    setSuccessMagic(null);

    if (!emailMagic) {
      setErrorMagic('Merci de renseigner ton email.');
      return;
    }

    setLoadingMagic(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailMagic,
        options: {
          emailRedirectTo: `${SITE_URL}/auth/callback`,
        },
      });

      if (error) {
        console.error('[LoginForm] signInWithOtp error', error);
        setErrorMagic("Impossible d'envoyer le lien de connexion.");
        setLoadingMagic(false);
        return;
      }

      setSuccessMagic(
        'Un lien de connexion t’a été envoyé. Pense à vérifier tes spams.',
      );
    } catch (err) {
      console.error('[LoginForm] unexpected error (magic link)', err);
      setErrorMagic('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoadingMagic(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-50">
            Connexion Tipote
          </h1>
          <p className="text-sm text-slate-400">
            Tu peux te connecter avec ton mot de passe ou demander un lien magique.
          </p>
        </header>

        {bannerMessage && (
          <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-900 rounded-md px-3 py-2">
            {bannerMessage}
          </p>
        )}

        {/* Bloc : login par mot de passe */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">
            Connexion par mot de passe
          </h2>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Mot de passe
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {errorPassword && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                {errorPassword}
              </p>
            )}

            <button
              type="submit"
              disabled={loadingPassword}
              className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-950 py-2 transition-colors"
            >
              {loadingPassword ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-right">
            <a
              href="/auth/forgot-password"
              className="text-emerald-400 hover:text-emerald-300"
            >
              Mot de passe oublié ?
            </a>
          </p>
        </section>

        <div className="h-px bg-slate-800" />

        {/* Bloc : login par lien magique */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">
            Ou recevoir un lien magique
          </h2>

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                value={emailMagic}
                onChange={(e) => setEmailMagic(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {errorMagic && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                {errorMagic}
              </p>
            )}

            {successMagic && (
              <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
                {successMagic}
              </p>
            )}

            <button
              type="submit"
              disabled={loadingMagic}
              className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-50 py-2 transition-colors"
            >
              {loadingMagic ? 'Envoi du lien...' : 'Envoyer un lien de connexion'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
