// app/settings/page.tsx
// Page Paramètres (Lovable) : Profil / Réglages / IA & API / Abonnement
// - Protégé par auth Supabase (server)
// - UI via SettingsTabsShell (client) pour coller au template

import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppShell from '@/components/AppShell'
import SettingsTabsShell from '@/components/settings/SettingsTabsShell'
import { Button } from '@/components/ui/button'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

type Props = {
  searchParams?: { tab?: string }
}

type TabKey = 'profile' | 'settings' | 'ai' | 'billing'

function normalizeTab(v: unknown): TabKey {
  if (typeof v !== 'string') return 'profile'
  const s = v.trim().toLowerCase()
  if (s === 'profile' || s === 'settings' || s === 'ai' || s === 'billing') return s
  return 'profile'
}

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user) redirect('/')

  const userEmail = auth.user.email ?? ''
  const activeTab = normalizeTab(searchParams?.tab)

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Paramètres"
      headerRight={
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/dashboard">Retour dashboard</Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
          <p className="text-sm text-muted-foreground">
            Gère ton profil, tes préférences, tes clés IA et ton abonnement.
          </p>
        </header>

        <SettingsTabsShell userEmail={userEmail} activeTab={activeTab} />
      </div>
    </AppShell>
  )
}
