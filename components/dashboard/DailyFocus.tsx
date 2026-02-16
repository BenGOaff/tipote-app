'use client'

// components/dashboard/DailyFocus.tsx
// Focus du jour – 1 seule action claire
// ✅ Lecture seule
// ✅ UX Lovable
// ✅ Aucune dépendance externe

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import MarkTaskDoneButton from '@/components/dashboard/MarkTaskDoneButton'

type Task = {
  id: string
  title: string
  status?: string | null
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
          Tu es à jour 🎉 Tu peux avancer sur ta stratégie ou créer du contenu.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/strategy">
            <Button variant="outline">Voir stratégie</Button>
          </Link>
          <Link href="/create">
            <Button className="bg-primary hover:bg-primary/90">Créer du contenu</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 border-primary/30">
      <p className="text-xs text-muted-foreground">Focus du jour</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{task.title}</p>

      <p className="mt-1 text-xs text-slate-500">Prochaine action à faire</p>

      <div className="mt-4 grid gap-2">
        <MarkTaskDoneButton
          taskId={task.id}
          initialStatus={task.status ?? null}
          className="w-full bg-primary hover:bg-primary/90"
        />

        <Link href="/tasks" className="w-full">
          <Button variant="outline" className="w-full">
            Voir toutes les tâches
          </Button>
        </Link>
      </div>
    </Card>
  )
}
