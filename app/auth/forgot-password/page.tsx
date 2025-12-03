// app/auth/forgot-password/page.tsx
// Rôle : page "mot de passe oublié" pour demander un email de reset.

import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-lg space-y-4">
        <h1 className="text-xl font-semibold text-slate-50">
          Mot de passe oublié
        </h1>
        <p className="text-sm text-slate-400">
          Entre ton email et nous t&apos;enverrons un lien pour définir un
          nouveau mot de passe.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
