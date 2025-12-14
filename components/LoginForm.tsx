// components/LoginForm.tsx
// Rôle : page de connexion Tipote (email + mot de passe + lien magique).
// IMPORTANT : On ne touche pas à la logique Supabase (handlers) pour ne rien casser.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { AlertTriangle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tipote.com';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  // --- UI state ---
  const [activeTab, setActiveTab] = useState<'password' | 'magic'>('password');
  const [showPassword, setShowPassword] = useState(false);

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

  const bannerMessage = useMemo(() => {
    return authError === 'missing_code'
      ? 'Lien de connexion invalide. Merci de recommencer.'
      : authError === 'invalid_code'
      ? 'Lien de connexion invalide ou expiré. Merci de recommencer.'
      : authError === 'unexpected'
      ? 'Erreur de connexion. Merci de réessayer.'
      : authError === 'not_authenticated'
      ? 'Tu dois être connecté pour accéder à cette page.'
      : null;
  }, [authError]);

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

      setSuccessMagic('Un lien de connexion t’a été envoyé. Pense à vérifier tes spams.');
    } catch (err) {
      console.error('[LoginForm] unexpected error (magic link)', err);
      setErrorMagic('Erreur inattendue. Merci de réessayer.');
    } finally {
      setLoadingMagic(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 py-10 bg-slate-950">
      <div className="w-full max-w-md">
        <Card className="border-slate-800 bg-slate-900/80 backdrop-blur rounded-2xl shadow-lg">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-slate-50">Connexion Tipote</CardTitle>
            <CardDescription className="text-slate-400">
              Connecte-toi pour accéder à ton espace (onboarding inclus).
            </CardDescription>

            {bannerMessage && (
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>{bannerMessage}</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'password' | 'magic')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="password" className="gap-2">
                  <Lock className="h-4 w-4" />
                  Mot de passe
                </TabsTrigger>
                <TabsTrigger value="magic" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Lien magique
                </TabsTrigger>
              </TabsList>

              {/* --- TAB: Mot de passe --- */}
              <TabsContent value="password" className="mt-5 space-y-4">
                {errorPassword && (
                  <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                    {errorPassword}
                  </div>
                )}

                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emailPassword" className="text-slate-200">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="emailPassword"
                        type="email"
                        className="pl-10"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-200">
                      Mot de passe
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        className="pl-10 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Link href="/auth/forgot-password" className="text-xs text-emerald-400 hover:text-emerald-300 transition">
                      Mot de passe oublié ?
                    </Link>
                  </div>

                  <Button type="submit" disabled={loadingPassword} className="w-full gap-2">
                    {loadingPassword ? 'Connexion...' : 'Se connecter'}
                    {!loadingPassword && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>

              {/* --- TAB: Lien magique --- */}
              <TabsContent value="magic" className="mt-5 space-y-4">
                {errorMagic && (
                  <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                    {errorMagic}
                  </div>
                )}
                {successMagic && (
                  <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                    {successMagic}
                  </div>
                )}

                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emailMagic" className="text-slate-200">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="emailMagic"
                        type="email"
                        className="pl-10"
                        value={emailMagic}
                        onChange={(e) => setEmailMagic(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={loadingMagic} className="w-full gap-2">
                    {loadingMagic ? 'Envoi...' : 'Recevoir le lien de connexion'}
                    {!loadingMagic && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>

                <p className="text-xs text-slate-500">
                  Le lien te redirigera automatiquement vers l’app.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-600">
          Besoin d’aide ? Vérifie tes spams pour le lien magique.
        </p>
      </div>
    </main>
  );
}
