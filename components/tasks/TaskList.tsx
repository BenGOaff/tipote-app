'use client'

// components/tasks/TaskList.tsx
// Liste de tâches – version interactive
// ✅ Utilise TaskItem
// ✅ Aucun changement de data source
// ✅ Respect strict du design Lovable

import TaskItem from './TaskItem'

type Task = {
  id: string
  title: string
  status: string | null
  due_date?: string | null
}

type Props = {
  tasks: Task[]
}

export default function TaskList({ tasks }: Props) {
  if (!tasks.length) {
    return (
      <p className="text-sm text-slate-500">
        Aucune tâche pour le moment.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          id={t.id}
          title={t.title}
          status={t.status}
          dueDate={t.due_date}
        />
      ))}
    </div>
  )
}
