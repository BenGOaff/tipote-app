'use client'

// components/dashboard/ExecutionStats.tsx
// Bloc stats exécution – Lovable
// ✅ Lecture API /api/tasks/stats
// ✅ Affichage simple, clean, sans surdesign

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

type Stats = {
  total: number
  done: number
  todo: number
  completionRate: number
}

export default function ExecutionStats() {
  const t = useTranslations('executionStats')
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      const res = await fetch('/api/tasks/stats')
      const json = await res.json().catch(() => null)
      if (!mounted) return
      if (json?.ok) {
        setStats(json)
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [])

  if (!stats) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">{t('loadingStats')}</p>
      </Card>
    )
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{t('execution')}</p>
          <p className="text-base font-semibold text-slate-900">
            {t('globalProgress')}
          </p>
        </div>
        <Badge variant="secondary">{stats.completionRate}%</Badge>
      </div>

      <Progress value={stats.completionRate} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Badge variant="secondary">{t('completed', { count: stats.done })}</Badge>
        <Badge variant="secondary">{t('remaining', { count: stats.todo })}</Badge>
        <Badge variant="secondary">{t('total', { count: stats.total })}</Badge>
      </div>
    </Card>
  )
}
