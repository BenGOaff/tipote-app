'use client'

// components/dashboard/ExecutionStats.tsx
// Bloc stats exécution – Lovable
// ✅ Lecture API /api/tasks/stats
// ✅ Affichage simple, clean, sans surdesign

import { useEffect, useState } from 'react'
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
        <p className="text-sm text-slate-500">Chargement des statistiques…</p>
      </Card>
    )
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Exécution</p>
          <p className="text-base font-semibold text-slate-900">
            Progression globale
          </p>
        </div>
        <Badge variant="secondary">{stats.completionRate}%</Badge>
      </div>

      <Progress value={stats.completionRate} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Badge variant="secondary">{stats.done} terminées</Badge>
        <Badge variant="secondary">{stats.todo} restantes</Badge>
        <Badge variant="secondary">{stats.total} au total</Badge>
      </div>
    </Card>
  )
}
