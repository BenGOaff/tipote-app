'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { User, Globe, Brain, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import ProfileSection from '@/components/settings/ProfileSection'
import ApiKeysManager from '@/components/settings/ApiKeysManager'
import BillingSection from '@/components/settings/BillingSection'
import SetPasswordForm from '@/components/SetPasswordForm'

type TabKey = 'profile' | 'settings' | 'ai' | 'billing'

type Props = {
  userEmail: string
  activeTab: TabKey
}

function normalizeTab(v: string | null): TabKey {
  const s = (v ?? '').trim().toLowerCase()
  if (s === 'profile' || s === 'settings' || s === 'ai' || s === 'billing') return s
  return 'profile'
}

export default function SettingsTabsShell({ userEmail, activeTab }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const [tab, setTab] = useState<TabKey>(activeTab)

  useEffect(() => {
    setTab(activeTab)
  }, [activeTab])

  const queryBase = useMemo(() => {
    const params = new URLSearchParams()
    sp.forEach((value, key) => {
      if (key === 'tab') return
      params.set(key, value)
    })
    return params
  }, [sp])

  const onTabChange = (next: string) => {
    const t = normalizeTab(next)
    setTab(t)
    const params = new URLSearchParams(queryBase)
    params.set('tab', t)
    const qs = params.toString()
    router.push(qs ? `/settings?${qs}` : '/settings')
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full">
      <TabsList className="mb-6 flex h-auto flex-wrap gap-1 rounded-2xl bg-muted/40 p-1">
        <TabsTrigger value="profile" className="gap-2 rounded-xl">
          <User className="h-4 w-4" />
          Profil
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2 rounded-xl">
          <Globe className="h-4 w-4" />
          Réglages
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-2 rounded-xl">
          <Brain className="h-4 w-4" />
          IA & API
        </TabsTrigger>
        <TabsTrigger value="billing" className="gap-2 rounded-xl">
          <CreditCard className="h-4 w-4" />
          Abonnement
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        {/* IMPORTANT : ProfileSection n’accepte pas de props */}
        <ProfileSection />

        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Sécurité</h3>
              <p className="mt-1 text-sm text-muted-foreground">Modifie ton mot de passe.</p>
            </div>
            <Badge variant="secondary" className="gap-1 rounded-xl">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Protégé
            </Badge>
          </div>

          {/* IMPORTANT : SetPasswordForm exige `mode` */}
          <SetPasswordForm mode="reset" />
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="space-y-6">
        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Préférences</h3>
              <p className="mt-1 text-sm text-muted-foreground">Ces réglages affineront les sorties IA.</p>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" disabled>
              Sauvegarder
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Cette section est prévue (backend) : elle sera injectée automatiquement dans les prompts.
            </p>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="ai" className="space-y-6">
        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Clés IA personnelles</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Utilisées pour la génération de contenu (niveau 2). Chiffrées côté serveur.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-xl">
              Recommandé
            </Badge>
          </div>

          <ApiKeysManager />

          <div className="mt-6 flex items-start gap-2 rounded-xl border bg-muted/20 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Prochaine étape : activer Claude/Gemini dans la génération (backend).
            </p>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="billing" className="space-y-6">
        <BillingSection email={userEmail} />
      </TabsContent>
    </Tabs>
  )
}
