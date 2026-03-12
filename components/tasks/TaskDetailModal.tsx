"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TagSelector, type Tag } from "./TagSelector";
import { SubtaskList, type Subtask } from "./SubtaskList";
import { Calendar, Clock, Save, Trash2, Tags, ListChecks, FileText, LayoutTemplate } from "lucide-react";
import { CHECKLIST_TEMPLATES, type ChecklistTemplate } from "@/lib/checklistTemplates";

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
  const t = useTranslations("taskDetail");
  const tc = useTranslations("checklistTemplates");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string | null>(null);
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
      setPriority(task.priority);
      setDueDate(task.due_date || "");
      setEstimatedDuration(task.estimated_duration || "");
      setSelectedTagIds(task.tags.map((tg) => tg.id));
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
        priority: priority || null,
        due_date: dueDate || null,
        estimated_duration: estimatedDuration || null,
        tag_ids: selectedTagIds,
      });
    } finally {
      setSaving(false);
    }
  }, [task, title, description, priority, dueDate, estimatedDuration, selectedTagIds, onSave]);

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

  const handleApplyTemplate = useCallback(async (template: ChecklistTemplate) => {
    if (!task) return;
    // Resolve items from i18n
    const items = Array.from({ length: template.itemCount }, (_, i) =>
      tc(`${template.id}.item_${i}`),
    );
    for (const item of items) {
      const newSt = await onAddSubtask(task.id, item);
      setSubtasks((prev) => [...prev, newSt]);
    }
  }, [task, onAddSubtask, tc]);

  if (!task) return null;

  const done = subtasks.filter((s) => s.is_done).length;
  const total = subtasks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-lg font-bold text-slate-900 dark:text-slate-100 border-none bg-transparent outline-none placeholder:text-slate-400"
            placeholder={t("titlePlaceholder")}
          />

          {/* Status + Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.status === "done" ? (
              <Badge variant="default">{t("statusDone")}</Badge>
            ) : (
              <Badge variant="outline">{t("statusTodo")}</Badge>
            )}
            {total > 0 && (
              <Badge variant="secondary">
                {t("subtasksCount", { done, total })}
              </Badge>
            )}
          </div>

          {/* Priority selector */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              Priorité
            </label>
            <div className="flex gap-1.5">
              {[
                { value: "high", label: t("priorityHigh"), color: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200" },
                { value: "medium", label: t("priorityMedium"), color: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200" },
                { value: "low", label: t("priorityLow"), color: "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(priority === p.value ? null : p.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    priority === p.value
                      ? p.color + " ring-1 ring-offset-1 ring-slate-300"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Tags className="h-3.5 w-3.5" /> {t("tags")}
            </div>
            <TagSelector
              allTags={allTags}
              selectedIds={selectedTagIds}
              onToggle={handleToggleTag}
              onCreate={handleCreateTag}
            />
          </div>

          {/* Due date + duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Calendar className="h-3.5 w-3.5" /> {t("dueDate")}
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
                <Clock className="h-3.5 w-3.5" /> {t("estimatedDuration")}
              </label>
              <input
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                placeholder={t("durationPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <FileText className="h-3.5 w-3.5" /> {t("notes")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-y min-h-[60px]"
            />
          </div>

          {/* Subtasks / Checklist */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ListChecks className="h-3.5 w-3.5" /> {t("checklist")}
            </div>

            {subtasks.length === 0 && CHECKLIST_TEMPLATES.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">{tc("applyTemplate")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {CHECKLIST_TEMPLATES.map((tpl) => (
                    <Button
                      key={tpl.id}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleApplyTemplate(tpl)}
                    >
                      <LayoutTemplate className="h-3 w-3" />
                      {tc(`${tpl.id}.label`)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

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
              <Trash2 className="h-4 w-4 mr-1" /> {t("delete")}
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
