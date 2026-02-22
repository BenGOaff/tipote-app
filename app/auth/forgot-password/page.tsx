// app/auth/forgot-password/page.tsx
// Rôle : page "mot de passe oublié" pour demander un email de reset.

import { Suspense } from 'react';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
