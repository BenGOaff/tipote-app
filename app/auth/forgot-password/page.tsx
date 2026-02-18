// app/auth/forgot-password/page.tsx
// Rôle : page "mot de passe oublié" pour demander un email de reset.

import { getTranslations } from 'next-intl/server';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('forgotPasswordPage');

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg space-y-4">
        <h1 className="text-xl font-semibold text-slate-50">
          {t('title')}
        </h1>
        <p className="text-sm text-slate-400">
          {t('description')}
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
