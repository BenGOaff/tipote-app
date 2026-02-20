// components/strategy/SortableTask.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";

export interface SortableTaskModel {
  id: string;
  task: string;
  done: boolean;
}

interface SortableTaskProps {
  task: SortableTaskModel;
  isEditing: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const SortableTask = ({
  task,
  isEditing,
  onToggle,
  onDelete,
}: SortableTaskProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors ${
        isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
      }`}
    >
      {isEditing && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      <Checkbox
        checked={task.done}
        onCheckedChange={() => onToggle(task.id)}
        disabled={isEditing}
      />

      <span
        className={`flex-1 ${
          task.done ? "line-through text-muted-foreground" : ""
        }`}
      >
        {task.task}
      </span>

      {/* Trash icon: always visible on hover, always visible in edit mode */}
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity ${
          isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={() => onDelete(task.id)}
        title="Supprimer la tâche"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};
