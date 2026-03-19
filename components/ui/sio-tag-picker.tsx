// components/ui/sio-tag-picker.tsx
// Composant réutilisable pour sélectionner un tag Systeme.io.
// Charge les tags depuis /api/systeme-io/tags, affiche un dropdown,
// et permet de créer de nouveaux tags inline.
// Affiche un message clair si la clé API n'est pas configurée.

"use client";

import { useState, useCallback } from "react";
import { Loader2, ChevronDown, Plus, Check, X, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type SioTag = { id: number; name: string };

type SioTagPickerProps = {
  value: string;
  onChange: (v: string) => void;
  /** Variante visuelle : "dark" pour le sidebar PageBuilder, "light" pour les modals */
  variant?: "dark" | "light";
  placeholder?: string;
};

export function SioTagPicker({ value, onChange, variant = "light", placeholder }: SioTagPickerProps) {
  const t = useTranslations("common");

  const [tags, setTags] = useState<SioTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [error, setError] = useState(false);

  // New tag inline creation
  const [creatingNew, setCreatingNew] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const isDark = variant === "dark";

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNoApiKey(false);
    try {
      const res = await fetch("/api/systeme-io/tags");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.tags)) {
        setTags(json.tags);
        setLoaded(true);
      } else if (json?.error === "NO_API_KEY") {
        setNoApiKey(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmNewTag = useCallback(() => {
    const name = newTagName.trim();
    if (!name) return;
    if (!tags.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setTags((prev) => [...prev, { id: Date.now(), name }]);
    }
    onChange(name);
    setCreatingNew(false);
    setNewTagName("");
  }, [newTagName, tags, onChange]);

  // No API key → message + link to settings
  if (noApiKey) {
    return (
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-700"
      }`}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          {t("sioNoApiKey")}{" "}
          <a href="/settings" className="underline font-medium hover:no-underline">
            {t("sioGoToSettings")}
          </a>
        </span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs ${isDark ? "text-red-400" : "text-destructive"}`}>
          {t("sioTagsError")}
        </span>
        <button
          onClick={loadTags}
          className={`text-xs underline ${isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("sioRetry")}
        </button>
      </div>
    );
  }

  // Creating new tag inline
  if (creatingNew) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder || t("sioNewTagPlaceholder")}
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmNewTag()}
          className={`flex-1 px-2 py-1.5 border rounded-lg text-xs ${
            isDark
              ? "bg-white/10 border-white/20 text-white placeholder:text-white/30"
              : "bg-background border-input text-foreground"
          }`}
          autoFocus
        />
        <button
          onClick={confirmNewTag}
          disabled={!newTagName.trim()}
          className={`px-2 py-1 rounded-md text-xs font-medium ${
            isDark
              ? "bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
              : "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
          }`}
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={() => { setCreatingNew(false); setNewTagName(""); }}
          className={`px-2 py-1 rounded-md text-xs ${
            isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Not loaded yet → "Load my tags" button
  if (!loaded) {
    return (
      <button
        onClick={loadTags}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          isDark
            ? "border-white/20 text-white/70 hover:text-white hover:border-white/40 bg-white/5"
            : "border-input text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background"
        }`}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
        {loading ? t("sioTagsLoading") : t("sioLoadTags")}
      </button>
    );
  }

  // Tags loaded → dropdown + create button
  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 h-8 rounded-lg border px-2 text-xs ${
          isDark
            ? "bg-white/10 border-white/20 text-white"
            : "bg-background border-input text-foreground"
        }`}
      >
        <option value="">{t("sioNoTag")}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.name}>{tag.name}</option>
        ))}
      </select>
      <button
        onClick={() => { setCreatingNew(true); setNewTagName(""); }}
        title={t("sioCreateTag")}
        className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
          isDark
            ? "border-white/20 text-white/60 hover:text-white hover:border-white/40 bg-white/5"
            : "border-input text-muted-foreground hover:text-foreground hover:border-foreground/30"
        }`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
