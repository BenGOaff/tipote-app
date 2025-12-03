// components/ForgotPasswordForm.tsx
// Rôle : formulaire pour déclencher l'email de reset du mot de passe.

'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tipote.com';

export default function ForgotPasswordForm() {
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email) {
      setErrorMsg('Merci de renseigner ton email.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}/auth/callback`,
      });

      if (error) {
        console.error(
          '[ForgotPasswordForm] resetPasswordForEmail error',
          error,
        );
        setErrorMsg(
          "Impossible d'envoyer l'email de réinitialisation. Vérifie l'adresse.",
        );
        setLoading(false);
        return;
      }

      setSuccessMsg(
        'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.',
      );
    } catch (err) {
      console.error('[ForgotPasswordForm] unexpected error', err);
      setErrorMsg('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          type="email"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
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
        {loading ? 'Envoi...' : 'Envoyer le lien'}
      </button>
    </form>
  );
}
