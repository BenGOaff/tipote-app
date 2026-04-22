// components/ui/sio-tag-picker.tsx
// Composant réutilisable pour sélectionner un tag Systeme.io.
// - Si enveloppé par <SioTagsProvider>, partage le chargement des tags
//   (un seul clic sur "Charger mes tags" suffit pour toute la page).
// - Sinon, fonctionne en mode autonome (backward compatible).

"use client";

import { useState, useCallback } from "react";
import { Loader2, ChevronDown, Plus, Check, X, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSioTagsContext } from "@/components/ui/sio-tags-provider";

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
  const ctx = useSioTagsContext();

  // Local fallback state when no provider is present.
  const [localTags, setLocalTags] = useState<SioTag[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localNoApiKey, setLocalNoApiKey] = useState(false);
  const [localError, setLocalError] = useState(false);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const isDark = variant === "dark";

  // When a provider is present, read from shared state. Otherwise fall back to local.
  const tags: SioTag[] = ctx ? (ctx.tags ?? []) : localTags;
  const loaded = ctx ? ctx.tags !== null : localLoaded;
  const loading = ctx ? ctx.loading : localLoading;
  const noApiKey = ctx ? ctx.noApiKey : localNoApiKey;
  const error = ctx ? ctx.error : localError;

  const loadTags = useCallback(async () => {
    if (ctx) {
      await ctx.loadTags();
      return;
    }
    setLocalLoading(true);
    setLocalError(false);
    setLocalNoApiKey(false);
    try {
      const res = await fetch("/api/systeme-io/tags");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.tags)) {
        setLocalTags(json.tags);
        setLocalLoaded(true);
      } else if (json?.error === "NO_API_KEY") {
        setLocalNoApiKey(true);
      } else {
        setLocalError(true);
      }
    } catch {
      setLocalError(true);
    } finally {
      setLocalLoading(false);
    }
  }, [ctx]);

  const confirmNewTag = useCallback(() => {
    const name = newTagName.trim();
    if (!name) return;
    if (ctx) {
      ctx.addTagLocal(name);
    } else if (!localTags.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setLocalTags((prev) => [...prev, { id: Date.now(), name }]);
    }
    onChange(name);
    setCreatingNew(false);
    setNewTagName("");
  }, [newTagName, localTags, onChange, ctx]);

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
