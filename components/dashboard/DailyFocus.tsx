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
  due_date?: string | null
  status?: string | null
}

type Props = {
  task: Task | null
}

function formatDateFR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long' }).format(d)
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
            <Button className="bg-[#b042b4] hover:bg-[#b042b4]/90">Créer du contenu</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 border-[#b042b4]/30">
      <p className="text-xs text-muted-foreground">Focus du jour</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{task.title}</p>

      {task.due_date ? (
        <p className="mt-1 text-xs text-slate-500">À faire aujourd’hui • {formatDateFR(task.due_date)}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">À faire aujourd’hui</p>
      )}

      <div className="mt-4 grid gap-2">
        <MarkTaskDoneButton
          taskId={task.id}
          initialStatus={task.status ?? null}
          className="w-full bg-[#b042b4] hover:bg-[#b042b4]/90"
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
