"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TagBadge } from "./TagBadge";
import { TagSelector, type Tag } from "./TagSelector";
import { SubtaskList, type Subtask } from "./SubtaskList";
import { Calendar, Clock, Save, Trash2, Tags, ListChecks, FileText } from "lucide-react";

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  estimated_duration: string | null;
  tags: Tag[];
  subtasks: Subtask[];
  subtasks_total: number;
  subtasks_done: number;
};

interface TaskDetailModalProps {
  task: TaskDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTags: Tag[];
  onSave: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (taskId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
  onAddSubtask: (taskId: string, title: string) => Promise<Subtask>;
  onToggleSubtask: (taskId: string, subtaskId: string, isDone: boolean) => Promise<void>;
  onDeleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
}

export function TaskDetailModal({
  task,
  open,
  onOpenChange,
  allTags,
  onSave,
  onDelete,
  onCreateTag,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [saving, setSaving] = useState(false);

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setDueDate(task.due_date || "");
      setEstimatedDuration(task.estimated_duration || "");
      setSelectedTagIds(task.tags.map((t) => t.id));
      setSubtasks(task.subtasks);
    }
  }, [task]);

  const handleSave = useCallback(async () => {
    if (!task) return;
    setSaving(true);
    try {
      await onSave(task.id, {
        title,
        description: description || null,
        due_date: dueDate || null,
        estimated_duration: estimatedDuration || null,
        tag_ids: selectedTagIds,
      });
    } finally {
      setSaving(false);
    }
  }, [task, title, description, dueDate, estimatedDuration, selectedTagIds, onSave]);

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const handleCreateTag = useCallback(async (name: string, color: string) => {
    const newTag = await onCreateTag(name, color);
    setSelectedTagIds((prev) => [...prev, newTag.id]);
  }, [onCreateTag]);

  const handleAddSubtask = useCallback(async (stTitle: string) => {
    if (!task) return;
    const newSt = await onAddSubtask(task.id, stTitle);
    setSubtasks((prev) => [...prev, newSt]);
  }, [task, onAddSubtask]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, isDone: boolean) => {
    if (!task) return;
    await onToggleSubtask(task.id, subtaskId, isDone);
    setSubtasks((prev) =>
      prev.map((st) => (st.id === subtaskId ? { ...st, is_done: isDone } : st)),
    );
  }, [task, onToggleSubtask]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    if (!task) return;
    await onDeleteSubtask(task.id, subtaskId);
    setSubtasks((prev) => prev.filter((st) => st.id !== subtaskId));
  }, [task, onDeleteSubtask]);

  if (!task) return null;

  const done = subtasks.filter((s) => s.is_done).length;
  const total = subtasks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Détail de la tâche</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-lg font-bold text-slate-900 border-none bg-transparent outline-none placeholder:text-slate-400"
            placeholder="Titre de la tâche"
          />

          {/* Status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.status === "done" ? (
              <Badge variant="default">Terminée</Badge>
            ) : (
              <Badge variant="outline">A faire</Badge>
            )}
            {task.priority && (
              <Badge
                variant={task.priority === "high" ? "destructive" : "secondary"}
              >
                {task.priority === "high" ? "Priorité haute" : task.priority === "medium" ? "Priorité moyenne" : "Priorité basse"}
              </Badge>
            )}
            {total > 0 && (
              <Badge variant="secondary">
                {done}/{total} sous-objectifs
              </Badge>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Tags className="h-3.5 w-3.5" /> Tags
            </div>
            <TagSelector
              allTags={allTags}
              selectedIds={selectedTagIds}
              onToggle={handleToggleTag}
              onCreate={handleCreateTag}
            />
          </div>

          {/* Due date + duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Calendar className="h-3.5 w-3.5" /> Echéance
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Durée estimée
              </label>
              <input
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                placeholder="ex: 2h, 1 jour..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <FileText className="h-3.5 w-3.5" /> Notes / description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Ajouter des détails, des liens, des notes..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-y min-h-[60px]"
            />
          </div>

          {/* Subtasks / Checklist */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ListChecks className="h-3.5 w-3.5" /> Checklist
            </div>
            <SubtaskList
              subtasks={subtasks}
              onToggle={handleToggleSubtask}
              onAdd={handleAddSubtask}
              onDelete={handleDeleteSubtask}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { onDelete(task.id); onOpenChange(false); }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Sauvegarde..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
