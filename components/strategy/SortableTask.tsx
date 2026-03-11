// components/strategy/SortableTask.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";
import { TagBadge } from "@/components/tasks/TagBadge";
import { Progress } from "@/components/ui/progress";

export interface SortableTaskModel {
  id: string;
  task: string;
  done: boolean;
  tags?: { id: string; name: string; color: string }[];
  subtasks_total?: number;
  subtasks_done?: number;
  due_date?: string | null;
  estimated_duration?: string | null;
}

interface SortableTaskProps {
  task: SortableTaskModel;
  isEditing: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenDetail?: (id: string) => void;
}

export const SortableTask = ({
  task,
  isEditing,
  onToggle,
  onDelete,
  onOpenDetail,
}: SortableTaskProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasSubtasks = (task.subtasks_total ?? 0) > 0;
  const subtaskProgress = hasSubtasks
    ? Math.round(((task.subtasks_done ?? 0) / (task.subtasks_total ?? 1)) * 100)
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-row
      className={`group flex flex-col gap-1.5 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer ${
        isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
      }`}
      onClick={() => !isEditing && onOpenDetail?.(task.id)}
      onKeyDown={(e) => {
        if (!isEditing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpenDetail?.(task.id);
        }
      }}
      role={!isEditing ? "button" : undefined}
      tabIndex={!isEditing ? 0 : undefined}
    >
      <div className="flex items-center gap-3">
        {isEditing && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        <Checkbox
          checked={task.done}
          onCheckedChange={() => onToggle(task.id)}
          disabled={isEditing}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />

        <span
          className={`flex-1 text-sm ${
            task.done ? "line-through text-muted-foreground" : ""
          }`}
        >
          {task.task}
        </span>

        {/* Trash icon */}
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity ${
            isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          title="Supprimer la tâche"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Tags + subtask progress + due date row */}
      {((task.tags && task.tags.length > 0) || hasSubtasks || task.due_date) && (
        <div className="flex items-center gap-2 pl-10 flex-wrap">
          {task.tags?.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
          ))}
          {hasSubtasks && (
            <div className="flex items-center gap-1.5">
              <Progress value={subtaskProgress} className="w-16 h-1.5" />
              <span className="text-[10px] text-muted-foreground">
                {task.subtasks_done}/{task.subtasks_total}
              </span>
            </div>
          )}
          {task.due_date && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(task.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
          )}
          {task.estimated_duration && (
            <span className="text-[10px] text-muted-foreground">
              {task.estimated_duration}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
