// app/onboarding/page.tsx
// Rôle : page d'onboarding stratégique (multi-step form Q1 → Q8)
// protégée par l'auth Supabase, rendue dans l'AppShell.

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import AppShell from '@/components/AppShell';
import OnboardingForm from '@/components/OnboardingForm';

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    // En cas de gros problème auth, on renvoie vers la page de login
    redirect('/?auth_error=server');
  }

  if (!session) {
    redirect('/');
  }

  const { data: existingProfile } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const userEmail = session.user.email ?? '';

  return (
    <AppShell userEmail={userEmail}>
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            Onboarding stratégique
          </h1>
          <p className="text-sm text-slate-600">
            Réponds à quelques questions. Tipote générera ensuite ton profil
            business, ta pyramide d&apos;offres et un plan d&apos;action 30/90
            jours automatiquement.
          </p>
        </header>

        <OnboardingForm initialProfile={existingProfile} />
      </section>
    </AppShell>
  );
}
