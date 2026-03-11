"use client";

import { useState } from "react";
import { TagBadge } from "./TagBadge";
import { Plus } from "lucide-react";

export type Tag = {
  id: string;
  name: string;
  color: string;
};

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
];

interface TagSelectorProps {
  allTags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onCreate: (name: string, color: string) => void;
}

export function TagSelector({ allTags, selectedIds, onToggle, onCreate }: TagSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed, newColor);
    setNewName("");
    setShowCreate(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {allTags.map((tag) => {
          const selected = selectedIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              className={`transition-all rounded-full ${selected ? "ring-2 ring-offset-1 ring-current" : "opacity-60 hover:opacity-100"}`}
              style={selected ? { color: tag.color } : undefined}
            >
              <TagBadge name={tag.name} color={tag.color} size="md" />
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          <Plus className="h-3 w-3" /> Nouveau tag
        </button>
      </div>

      {showCreate && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            placeholder="Nom du tag..."
            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            maxLength={50}
          />
          <div className="flex gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-all ${newColor === c ? "border-slate-800 scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
