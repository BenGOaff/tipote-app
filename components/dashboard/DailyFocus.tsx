'use client'

// components/dashboard/DailyFocus.tsx
// Focus du jour – 1 seule action claire
// ✅ Lecture seule
// ✅ UX Lovable
// ✅ Aucune dépendance externe

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Task = {
  id: string
  title: string
  due_date?: string | null
}

type Props = {
  task: Task | null
}

export default function DailyFocus({ task }: Props) {
  if (!task) {
    return (
      <Card className="p-5">
        <p className="text-xs text-muted-foreground">Focus du jour</p>
        <p className="mt-1 text-sm text-slate-700">
          Tu es à jour 🎉  
          Tu peux avancer sur ta stratégie ou créer du contenu.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/strategy">
            <Button variant="outline">Voir stratégie</Button>
          </Link>
          <Link href="/create">
            <Button className="bg-[#b042b4]">Créer du contenu</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 border-[#b042b4]/30">
      <p className="text-xs text-muted-foreground">Focus du jour</p>
      <p className="mt-1 text-base font-semibold text-slate-900">
        {task.title}
      </p>

      {task.due_date && (
        <p className="mt-1 text-xs text-slate-500">
          À faire aujourd’hui
        </p>
      )}

      <div className="mt-4">
        <Link href="/tasks">
          <Button className="bg-[#b042b4] w-full">
            Marquer comme faite
          </Button>
        </Link>
      </div>
    </Card>
  )
}
