// components/LoginForm.tsx
'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser';

const SYSTEME_IO_SALES_PAGE_URL =
  'https://www.blagardette.com/tipote-test'; // 🔁 à remplacer par ta vraie page de vente

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail === '') {
      setError('Merci de renseigner ton adresse email.');
      return;
    }

    try {
      setIsSubmitting(true);

      const supabase = getSupabaseBrowserClient();

      const { error: authError } = await supabase.auth.signInWithOtp({
  email: trimmedEmail,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});


      if (authError) {
        throw authError;
      }

      setMessage(
        "Un lien de connexion vient d'être envoyé à cette adresse. " +
          'Pense à vérifier aussi tes spams.',
      );
    } catch (err: any) {
      console.error('[LoginForm] signInWithOtp error', err);
      setError(
        err?.message ??
          "Une erreur est survenue lors de l'envoi du lien de connexion.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoToSalesPage() {
    router.push(SYSTEME_IO_SALES_PAGE_URL);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-[#641168] to-[#B042B4] px-4 py-8">
      <div className="flex w-full max-w-4xl flex-col gap-8 rounded-3xl bg-zinc-950/80 p-6 shadow-2xl ring-1 ring-white/10 md:flex-row md:p-10">
        {/* Colonne gauche : branding */}
        <div className="flex flex-1 flex-col justify-between gap-6 text-white">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Accès réservé aux membres Tipote®</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Connexion à <span className="text-[#B042B4]">Tipote</span>
            </h1>
            <p className="max-w-md text-sm text-zinc-300">
              Analyse ton business, planifie ta stratégie et génère des contenus
              organisés en quelques minutes. Connecte-toi avec le lien magique
              envoyé par email.
            </p>
          </div>

          <div className="hidden flex-col gap-2 text-xs text-zinc-400 md:flex">
            <p>
              Pas encore de compte ?{' '}
              <button
                type="button"
                onClick={handleGoToSalesPage}
                className="font-medium text-[#B042B4] underline-offset-2 hover:underline"
              >
                Découvre les offres et inscris-toi 😉
              </button>
            </p>
            <p>Tipote® {new Date().getFullYear()} – Tous droits réservés.</p>
          </div>
        </div>

        {/* Colonne droite : formulaire */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="rounded-2xl bg-zinc-900/80 p-6 shadow-inner ring-1 ring-white/10">
            <h2 className="text-lg font-medium text-white">
              Connecte-toi à ton Tipote :
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Renseigne l’email utilisé lors de ton achat sur Systeme.io. Nous
              t’enverrons un lien de connexion sécurisé.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-xs font-medium text-zinc-200"
                >
                  Adresse email d'achat
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition focus:border-[#B042B4] focus:ring-2 focus:ring-[#B042B4]/40"
                  placeholder="jekiffe@tipote.com"
                />
                <p className="text-[11px] text-zinc-400">
                  Si tu as oublié ton mot de passe, renseigne simplement ton
                  email et clique sur « Recevoir le lien de connexion ». Tu
                  recevras un email sécurisé pour te connecter.
                </p>
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              {message && (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  {message}
                </p>
              )}

              <div className="space-y-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-black/40 transition hover:bg-zinc-900 disabled:opacity-60"
                >
                  {isSubmitting
                    ? 'Envoi du lien…'
                    : 'Recevoir le lien de connexion'}
                </button>

                <button
                  type="button"
                  onClick={handleGoToSalesPage}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[#B042B4]/70 bg-transparent px-4 py-2.5 text-sm font-medium text-[#B042B4] shadow-sm shadow-black/20 transition hover:border-[#B042B4] hover:bg-[#B042B4]/10"
                >
                  Créer un compte / changer de plan
                </button>
              </div>
            </form>
          </div>

          {/* Version mobile du lien inscription */}
          <div className="mt-4 flex flex-col gap-1 text-center text-[11px] text-zinc-400 md:hidden">
            <button
              type="button"
              onClick={handleGoToSalesPage}
              className="font-medium text-[#B042B4] underline-offset-2 hover:underline"
            >
              Pas encore de compte ? Découvre les offres Tipote® 😉
            </button>
            <span>Tipote © {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
