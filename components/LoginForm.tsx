// components/LoginForm.tsx
// Rôle : page de connexion Tipote (email + mot de passe + lien magique).
// IMPORTANT : On conserve la logique Supabase (handlers) et les redirects.

'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Eye, EyeOff, Mail, Lock, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.tipote.com';

type Mode = 'password' | 'magic';

function parseHashParams(hash: string): Record<string, string> {
  const h = (hash || '').replace(/^#/, '').trim();
  const out: Record<string, string> = {};
  if (!h) return out;

  for (const part of h.split('&')) {
    const [k, v] = part.split('=');
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

export default function LoginForm() {
  const t = useTranslations('loginPage');
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<Mode>('password');
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
      ? t('bannerMissingCode')
      : authError === 'invalid_code'
        ? t('bannerInvalidCode')
        : authError === 'unexpected'
          ? t('bannerUnexpected')
          : authError === 'not_authenticated'
            ? t('bannerNotAuth')
            : null;
  }, [authError, t]);

  // ✅ FIX CRITIQUE : si Supabase redirige sur "/" avec #access_token=...
  // on renvoie automatiquement vers /auth/callback qui consomme le hash et crée la session.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash || '';
    const hp = parseHashParams(hash);

    const hasAccess = !!(hp.access_token || '').trim();
    const hasRefresh = !!(hp.refresh_token || '').trim();

    // cas le plus fréquent (invite / recovery / magiclink) : access_token + refresh_token
    if (hasAccess && hasRefresh) {
      router.replace(`/auth/callback${hash}`);
      return;
    }

    // cas PKCE : ?code=...
    const code = (searchParams.get('code') || '').trim();
    if (code) {
      const qs = searchParams.toString();
      router.replace(`/auth/callback${qs ? `?${qs}` : ''}`);
      return;
    }
  }, [router, searchParams]);

  // Si l'utilisateur arrive avec "type=recovery" ou "type=magiclink" (legacy Lovable),
  // on le bascule sur le mode magic pour éviter une page "vide".
  useEffect(() => {
    const ty = searchParams.get('type');
    if (ty === 'magiclink') setMode('magic');
  }, [searchParams]);

  // --- Submit : login par mot de passe ---
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorPassword(null);

    if (!emailPassword || !password) {
      setErrorPassword(t('errFillCredentials'));
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
        setErrorPassword(t('errInvalidCredentials'));
        setLoadingPassword(false);
        return;
      }

      router.push('/app');
    } catch (err) {
      console.error('[LoginForm] unexpected error (password login)', err);
      setErrorPassword(t('errUnexpected'));
      setLoadingPassword(false);
    }
  }

  // --- Submit : envoi du lien magique ---
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMagic(null);
    setSuccessMagic(null);

    if (!emailMagic) {
      setErrorMagic(t('errFillEmail'));
      return;
    }

    setLoadingMagic(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailMagic,
        options: {
          // ⚠️ Très important : doit pointer sur app.tipote.com (pas tipote.com)
          emailRedirectTo: `${SITE_URL}/auth/callback`,
        },
      });

      if (error) {
        console.error('[LoginForm] signInWithOtp error', error);
        setErrorMagic(t('errSendFailed'));
        setLoadingMagic(false);
        return;
      }

      setSuccessMagic(t('successMagic'));
    } catch (err) {
      console.error('[LoginForm] unexpected error (magic link)', err);
      setErrorMagic(t('errUnexpected'));
    } finally {
      setLoadingMagic(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Tipote<span className="text-primary">™</span>
          </h1>
          <p className="text-muted-foreground mt-2">{t('tagline')}</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">
              {mode === 'password' ? t('titlePassword') : t('titleMagic')}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === 'password' ? t('descPassword') : t('descMagic')}
            </CardDescription>

            {bannerMessage && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>{bannerMessage}</span>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {/* --- Mode: Mot de passe --- */}
            {mode === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {errorPassword && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorPassword}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="emailPassword">{t('labelEmail')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailPassword"
                      type="email"
                      placeholder={t('placeholderEmail')}
                      className="pl-10"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t('labelPassword')}</Label>
                    <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                      {t('forgotPassword')}
                    </Link>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? t('ariaHide') : t('ariaShow')}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingPassword}>
                  {loadingPassword ? (
                    t('signingIn')
                  ) : (
                    <>
                      {t('signIn')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('magic')}>
                  {t('magicLink')}
                </Button>
              </form>
            )}

            {/* --- Mode: Lien magique --- */}
            {mode === 'magic' && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                {errorMagic && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMagic}
                  </div>
                )}
                {successMagic && (
                  <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
                    {successMagic}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="emailMagic">{t('labelEmail')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emailMagic"
                      type="email"
                      placeholder={t('placeholderEmail')}
                      className="pl-10"
                      value={emailMagic}
                      onChange={(e) => setEmailMagic(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loadingMagic}>
                  {loadingMagic ? (
                    t('sending')
                  ) : (
                    <>
                      {t('sendLink')}
                      <Mail className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('password')}>
                  {t('backToLogin')}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {t('magicLinkInfo')}
                </p>
              </form>
            )}

            {/* Signup CTA */}
            {mode === 'password' && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-center text-sm text-muted-foreground mb-3">{t('noAccount')}</p>
                <Button variant="outline" className="w-full" asChild>
                  <a href="https://www.tipote.com/" target="_blank" rel="noopener noreferrer">
                    {t('createAccount')}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
