// app/page.tsx
// Rôle : page de login (publique) qui affiche LoginForm.
// On entoure LoginForm avec Suspense pour satisfaire Next 16
// car LoginForm utilise useSearchParams (client component).

import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
