// components/ForgotPasswordForm.tsx
// Rôle : formulaire pour déclencher l'email de reset du mot de passe.
// Design aligné sur LoginForm (Card + composants UI + tokens du design system).

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Mail, ArrowLeft } from 'lucide-react';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.tipote.com';

export default function ForgotPasswordForm() {
  const t = useTranslations('forgotPasswordPage');
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg(t('errFillEmail'));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${SITE_URL}/auth/callback`,
      });

      if (error) {
        console.error(
          '[ForgotPasswordForm] resetPasswordForEmail error',
          error.message,
          error.status,
        );

        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rate') || msg.includes('limit') || error.status === 429) {
          setErrorMsg(t('errRateLimit'));
        } else {
          setErrorMsg(t('errSendFailed'));
        }
        setLoading(false);
        return;
      }

      setSuccessMsg(t('successSent'));
    } catch (err) {
      console.error('[ForgotPasswordForm] unexpected error', err);
      setErrorMsg(t('errUnexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Tipote<span className="text-primary">&trade;</span>
          </h1>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">
              {t('title')}
            </CardTitle>
            <CardDescription className="text-center">
              {t('description')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {successMsg}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="emailReset">{t('labelEmail')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailReset"
                    type="email"
                    placeholder="nom@domaine.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  t('sending')
                ) : (
                  <>
                    {t('sendLink')}
                    <Mail className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('backToLogin')}
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
