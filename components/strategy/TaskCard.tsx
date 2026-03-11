// components/strategy/TaskCard.tsx
// Trello-inspired task card for phase pages.
// Shows all key info at a glance: tags, subtask progress, description, due date, priority.
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TagBadge } from "@/components/tasks/TagBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, ListChecks, GripVertical, AlertCircle } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  estimated_duration: string | null;
  tags: { id: string; name: string; color: string }[];
  subtasks_total: number;
  subtasks_done: number;
}

interface TaskCardProps {
  task: TaskCardData;
  onToggle: (taskId: string, done: boolean) => void;
  onOpenDetail: (taskId: string) => void;
  onPriorityChange: (taskId: string, priority: string) => void;
  isDraggable?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-slate-500 bg-slate-50 border-slate-200",
};

export function TaskCard({
  task,
  onToggle,
  onOpenDetail,
  onPriorityChange,
  isDraggable = true,
}: TaskCardProps) {
  const t = useTranslations("taskDetail");
  const tp = useTranslations("phasePage");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const done = task.status === "done";
  const hasSubtasks = task.subtasks_total > 0;
  const subtaskProgress = hasSubtasks
    ? Math.round((task.subtasks_done / task.subtasks_total) * 100)
    : 0;

  // Check if overdue
  const isOverdue = task.due_date && !done && new Date(task.due_date) < new Date();

  const handlePriorityChange = useCallback(
    (value: string) => {
      onPriorityChange(task.id, value);
    },
    [task.id, onPriorityChange],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "group rounded-xl border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer",
        isDragging ? "shadow-lg ring-2 ring-primary/20 rotate-1" : "",
        done ? "opacity-60" : "",
      ].join(" ")}
      onClick={() => onOpenDetail(task.id)}
    >
      <div className="p-3 sm:p-4 space-y-2.5">
        {/* Tags row */}
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
          </div>
        )}

        {/* Title + checkbox + drag handle */}
        <div className="flex items-start gap-2.5">
          {isDraggable && (
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}

          <Checkbox
            checked={done}
            onCheckedChange={(checked) => {
              onToggle(task.id, !!checked);
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="mt-0.5 shrink-0"
          />

          <span
            className={[
              "flex-1 text-sm font-medium leading-snug",
              done ? "line-through text-muted-foreground" : "",
            ].join(" ")}
          >
            {task.title}
          </span>
        </div>

        {/* Description preview */}
        {task.description && !done && (
          <p className="text-xs text-muted-foreground line-clamp-2 pl-8">
            {task.description}
          </p>
        )}

        {/* Subtask progress */}
        {hasSubtasks && (
          <div className="flex items-center gap-2 pl-8">
            <ListChecks className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Progress value={subtaskProgress} className="flex-1 h-1.5" />
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
              {task.subtasks_done}/{task.subtasks_total}
            </span>
          </div>
        )}

        {/* Metadata row: due date, duration, priority */}
        <div className="flex items-center gap-2 pl-8 flex-wrap">
          {task.due_date && (
            <span
              className={[
                "inline-flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5",
                isOverdue
                  ? "text-red-600 bg-red-50 font-medium"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {isOverdue && <AlertCircle className="w-3 h-3" />}
              <Calendar className="w-3 h-3" />
              {new Date(task.due_date).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}

          {task.estimated_duration && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {task.estimated_duration}
            </span>
          )}

          {/* Priority dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={task.priority || "none"}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger
                className={[
                  "h-6 text-[11px] border rounded-md px-2 gap-1 min-w-0 w-auto",
                  task.priority
                    ? PRIORITY_COLORS[task.priority] || ""
                    : "text-muted-foreground bg-transparent border-dashed",
                ].join(" ")}
              >
                <SelectValue placeholder={tp("noPriority")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">{t("priorityHigh")}</SelectItem>
                <SelectItem value="medium">{t("priorityMedium")}</SelectItem>
                <SelectItem value="low">{t("priorityLow")}</SelectItem>
                <SelectItem value="none">{tp("noPriority")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
