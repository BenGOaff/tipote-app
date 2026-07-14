// components/ui/sio-tags-multi-picker.tsx
// Sélecteur MULTI-tags Systeme.io — plusieurs tags par profil de réponse.
// Demande Gwenn 12 juillet 2026 : "plusieurs tags par profil de réponse.
// Je dois séparer une liste en deux, et certains iront dans les deux."
//
// Réutilise <SioTagsProvider> (même chargement partagé que SioTagPicker) :
// - `value` = tableau de noms de tags déjà sélectionnés.
// - `onChange` = nouveau tableau (ajout / retrait / création).
// Backward compatible : le picker single (SioTagPicker) reste dispo.

"use client";

import { useState, useCallback } from "react";
import { Loader2, ChevronDown, Plus, Check, X, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSioTagsContext } from "@/components/ui/sio-tags-provider";

type SioTag = { id: number; name: string };

type SioTagsMultiPickerProps = {
  value: string[];
  onChange: (v: string[]) => void;
  variant?: "dark" | "light";
  placeholder?: string;
};

export function SioTagsMultiPicker({ value, onChange, variant = "light", placeholder }: SioTagsMultiPickerProps) {
  const t = useTranslations("common");
  const ctx = useSioTagsContext();

  const [localTags, setLocalTags] = useState<SioTag[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [localNoApiKey, setLocalNoApiKey] = useState(false);
  const [localError, setLocalError] = useState(false);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const isDark = variant === "dark";

  const tags: SioTag[] = ctx ? (ctx.tags ?? []) : localTags;
  const loaded = ctx ? ctx.tags !== null : localLoaded;
  const loading = ctx ? ctx.loading : localLoading;
  const noApiKey = ctx ? ctx.noApiKey : localNoApiKey;
  const error = ctx ? ctx.error : localError;

  // Nettoie / dé-duplique en préservant l'ordre (insensible à la casse).
  const selected = value.filter((v, i) => v && value.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

  const addTag = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (value.some((v) => v.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, clean]);
  }, [value, onChange]);

  const removeTag = useCallback((name: string) => {
    onChange(value.filter((v) => v.toLowerCase() !== name.toLowerCase()));
  }, [value, onChange]);

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
      } else if (Array.isArray(json?.tags)) {
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
    } else if (!localTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      setLocalTags((prev) => [...prev, { id: Date.now(), name }]);
    }
    addTag(name);
    setCreatingNew(false);
    setNewTagName("");
  }, [newTagName, localTags, addTag, ctx]);

  // Chips des tags déjà choisis (retirables) — affichées dans tous les états.
  const chips = selected.length > 0 ? (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {selected.map((name) => (
        <span
          key={name}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
            isDark ? "bg-white/10 text-white/80" : "bg-primary/10 text-primary"
          }`}
        >
          {name}
          <button
            type="button"
            onClick={() => removeTag(name)}
            className={isDark ? "hover:text-white" : "hover:text-primary/70"}
            aria-label={`${name} ✕`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  ) : null;

  if (noApiKey) {
    return (
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-700"
      }`}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          {t("sioNoApiKey")}{" "}
          <a href="/settings?tab=systemeio" className="underline font-medium hover:no-underline">
            {t("sioGoToSettings")}
          </a>
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {chips}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${isDark ? "text-red-400" : "text-destructive"}`}>
            {t("sioTagsError")}
          </span>
          <button
            type="button"
            onClick={loadTags}
            className={`text-xs underline ${isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("sioRetry")}
          </button>
        </div>
      </div>
    );
  }

  if (creatingNew) {
    return (
      <div>
        {chips}
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
            type="button"
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
            type="button"
            onClick={() => { setCreatingNew(false); setNewTagName(""); }}
            className={`px-2 py-1 rounded-md text-xs ${
              isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div>
        {chips}
        <button
          type="button"
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
      </div>
    );
  }

  // Options = tags pas encore sélectionnés.
  const available = tags.filter((tag) => !selected.some((s) => s.toLowerCase() === tag.name.toLowerCase()));

  return (
    <div>
      {chips}
      <div className="flex gap-2">
        <select
          value=""
          onChange={(e) => { if (e.target.value) addTag(e.target.value); }}
          className={`flex-1 h-8 rounded-lg border px-2 text-xs ${
            isDark
              ? "bg-white/10 border-white/20 text-white"
              : "bg-background border-input text-foreground"
          }`}
        >
          <option value="">{t("sioAddTag")}</option>
          {available.map((tag) => (
            <option key={tag.id} value={tag.name}>{tag.name}</option>
          ))}
        </select>
        <button
          type="button"
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
    </div>
  );
}
