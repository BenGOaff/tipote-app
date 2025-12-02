// app/app/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import LogoutButton from '@/components/LogoutButton';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const metadata: Metadata = {
  title: 'Tipote – Espace membre',
};

export default async function AppPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Si pas de session, on renvoie vers la page de connexion
    redirect('/');
  }

  const userEmail = session.user.email ?? 'Utilisateur';

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header simple */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#B042B4] to-[#641168] text-xs font-bold text-white">
              T
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-900">
                Tipote
              </span>
              <span className="text-xs text-zinc-500">Espace membre</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-zinc-500 sm:inline">
              Connecté en tant que{' '}
              <span className="font-medium text-zinc-800">{userEmail}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-8 rounded-2xl bg-white px-6 py-6 shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Bienvenue dans ton espace Tipote 👋
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Ici tu retrouveras bientôt&nbsp;:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
            <li>ton onboarding stratégique (profil business + plan d’action),</li>
            <li>tes modules Tipote (contenus, automatisations, etc.),</li>
            <li>la page &quot;Paramètres&quot; (profil, abonnement, clés IA…).</li>
          </ul>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">
              1. Profil & business
            </h2>
            <p className="mt-2 text-xs text-zinc-600">
              On ajoutera ici ton profil business, ton avatar stratégique et les
              infos clés de ton entreprise.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">
              2. Modules & contenus
            </h2>
            <p className="mt-2 text-xs text-zinc-600">
              Accès futur à tes modules Tipote (ex : Social Content Engine,
              offres, emails, etc.).
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">
              3. Paramètres & abonnement
            </h2>
            <p className="mt-2 text-xs text-zinc-600">
              Gestion de ton compte, de ton abonnement et de tes clés IA perso.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
