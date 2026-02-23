'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, ChevronDown } from 'lucide-react'
import TaskList, { type TaskItemType } from './TaskList'

export default function CompletedTasksSection({ tasks }: { tasks: TaskItemType[] }) {
  const [open, setOpen] = useState(false)

  if (tasks.length === 0) return null

  return (
    <Card className="p-6">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(!open)}
      >
        <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
        <span className="font-semibold flex-1">Tâches terminées</span>
        <Badge variant="secondary">{tasks.length}</Badge>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-4">
          <TaskList tasks={tasks} allowEdit variant="card" />
        </div>
      )}
    </Card>
  )
}
