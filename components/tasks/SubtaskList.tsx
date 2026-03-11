"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export type Subtask = {
  id: string;
  title: string;
  is_done: boolean;
  position: number;
};

interface SubtaskListProps {
  subtasks: Subtask[];
  onToggle: (subtaskId: string, isDone: boolean) => void;
  onAdd: (title: string) => void;
  onDelete: (subtaskId: string) => void;
}

export function SubtaskList({ subtasks, onToggle, onAdd, onDelete }: SubtaskListProps) {
  const t = useTranslations("taskDetail");
  const [newTitle, setNewTitle] = useState("");

  const total = subtasks.length;
  const done = subtasks.filter((s) => s.is_done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  function handleAdd() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewTitle("");
  }

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={progress} className="flex-1 h-2" />
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
            {done}/{total}
          </span>
        </div>
      )}

      <div className="space-y-1">
        {subtasks.map((st) => (
          <div
            key={st.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
          >
            <Checkbox
              checked={st.is_done}
              onCheckedChange={(checked) => onToggle(st.id, !!checked)}
            />
            <span
              className={`flex-1 text-sm ${st.is_done ? "line-through text-slate-400" : "text-slate-700"}`}
            >
              {st.title}
            </span>
            <button
              type="button"
              onClick={() => onDelete(st.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-slate-400" />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder={t("addSubtask")}
          className="flex-1 border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          maxLength={500}
        />
      </div>
    </div>
  );
}
