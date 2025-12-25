'use client'

// components/tasks/TaskList.tsx
// Liste de tâches – version interactive
// ✅ Utilise TaskItem
// ✅ Aucun changement de data source
// ✅ Respect strict du design Lovable

import TaskItem from './TaskItem'

export type TaskItemType = {
  id: string
  title: string
  status: string | null
  due_date?: string | null
}

// Alias pour compat avec l'import actuel: `type TaskItem`
export type TaskItem = TaskItemType

type Props = {
  tasks: TaskItemType[]
}

export function TaskList({ tasks }: Props) {
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

// ✅ Compat avec les imports existants : `import TaskList from ...`
export default TaskList
