"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Pencil, Plus, Trash2, X, Check, Palette as PaletteIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// One palette = a named bag of up to MAX_COLORS swatches the creator
// can apply with a single click on any color input. Soft limits enforced
// client-side; the API mirrors them so a tampered request still bounces.
export const MAX_PALETTES = 10;
export const MAX_COLORS = 5;

export type Palette = {
  id: string;
  name: string;
  colors: string[];
};

export type PaletteList = Palette[];

const STORAGE_KEY = "tiquiz:selected-palette-id";

function newPaletteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normaliseHex(input: string): string | null {
  const v = (input || "").trim();
  if (!v) return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (!m) return null;
  const raw = m[1];
  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  return `#${full.toLowerCase()}`;
}

export function UserPalettePicker({
  currentColor,
  onPick,
  palettes,
  onChangePalettes,
  className,
  compact,
}: {
  currentColor: string;
  onPick: (color: string) => void;
  palettes: PaletteList;
  onChangePalettes: (next: PaletteList) => void | Promise<void>;
  className?: string;
  /** Hide the palette-selector chip; only show swatches + save button. */
  compact?: boolean;
}) {
  const t = useTranslations("palettes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Restore last picked palette from localStorage so the row stays in
  // sync between editor reopens (and between editors of the same user).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && palettes.some((p) => p.id === stored)) {
      setSelectedId(stored);
    } else if (palettes.length > 0) {
      setSelectedId(palettes[0].id);
    } else {
      setSelectedId(null);
    }
  }, [palettes]);

  // Click-out closes the palette dropdown without dismissing other
  // overlays on the page.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const selected = useMemo(
    () => palettes.find((p) => p.id === selectedId) ?? null,
    [palettes, selectedId],
  );

  const persistSelected = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === "undefined") return;
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* quota or disabled — non-fatal */ }
  }, []);

  const addCurrentColorToSelected = useCallback(async () => {
    const hex = normaliseHex(currentColor);
    if (!hex) return;
    let next: PaletteList;
    if (!selected) {
      const fresh: Palette = {
        id: newPaletteId(),
        name: t("defaultPaletteName"),
        colors: [hex],
      };
      next = [...palettes, fresh];
      await Promise.resolve(onChangePalettes(next));
      persistSelected(fresh.id);
      return;
    }
    if (selected.colors.includes(hex)) return;
    if (selected.colors.length >= MAX_COLORS) {
      // Bump the oldest entry — keeps the row at 5 without nagging the
      // user when their palette is full. The manage dialog still allows
      // explicit reordering / removal.
      next = palettes.map((p) =>
        p.id !== selected.id ? p : { ...p, colors: [...p.colors.slice(1), hex] },
      );
    } else {
      next = palettes.map((p) =>
        p.id !== selected.id ? p : { ...p, colors: [...p.colors, hex] },
      );
    }
    await Promise.resolve(onChangePalettes(next));
  }, [currentColor, selected, palettes, onChangePalettes, persistSelected, t]);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <PaletteIcon className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden />
        {!compact && palettes.length > 0 && (
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border bg-background hover:bg-muted/50 inline-flex items-center gap-1 max-w-[140px]"
            title={t("selectorTitle")}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          >
            <span className="truncate">{selected?.name ?? t("noPalette")}</span>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
        )}

        <div className="flex items-center gap-1">
          {(selected?.colors ?? []).slice(0, MAX_COLORS).map((c, i) => {
            const active = c.toLowerCase() === (normaliseHex(currentColor) ?? "");
            return (
              <button
                key={`${selected?.id}-${i}-${c}`}
                type="button"
                onClick={() => onPick(c)}
                title={c}
                aria-label={c}
                className={`relative w-5 h-5 rounded-full border transition-transform hover:scale-110 ${active ? "ring-2 ring-offset-1 ring-primary" : "border-black/10"}`}
                style={{ backgroundColor: c }}
              >
                {active && <Check className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addCurrentColorToSelected}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          title={t("saveCurrentTitle")}
        >
          <Plus className="w-3 h-3" />
          {t("saveCurrent")}
        </button>

        {palettes.length === 0 && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            {t("manage")}
          </button>
        )}
      </div>

      {/* Palette selector dropdown — anchored to the chip button. */}
      {menuOpen && (
        <div className="absolute z-30 top-full left-0 mt-1 w-56 rounded-lg border bg-popover shadow-md p-1">
          <ul className="space-y-0.5 max-h-60 overflow-auto">
            {palettes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { persistSelected(p.id); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted ${selectedId === p.id ? "bg-muted" : ""}`}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="flex gap-0.5 shrink-0">
                    {p.colors.slice(0, MAX_COLORS).map((c, i) => (
                      <span
                        key={i}
                        className="w-2.5 h-2.5 rounded-full border border-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t mt-1 pt-1">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setManageOpen(true); }}
              className="w-full px-2 py-1.5 text-xs text-left hover:bg-muted rounded inline-flex items-center gap-2"
            >
              <Pencil className="w-3 h-3" />
              {t("manage")}
            </button>
          </div>
        </div>
      )}

      <ManagePalettesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        palettes={palettes}
        onChangePalettes={onChangePalettes}
        selectedId={selectedId}
        onSelect={persistSelected}
      />
    </div>
  );
}

// ─── Manage dialog ────────────────────────────────────────────────

function ManagePalettesDialog({
  open,
  onOpenChange,
  palettes,
  onChangePalettes,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  palettes: PaletteList;
  onChangePalettes: (next: PaletteList) => void | Promise<void>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("palettes");
  const [draft, setDraft] = useState<PaletteList>(palettes);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(palettes);
      setDirty(false);
    }
  }, [open, palettes]);

  const update = useCallback((next: PaletteList) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const addPalette = () => {
    if (draft.length >= MAX_PALETTES) return;
    const fresh: Palette = {
      id: newPaletteId(),
      name: t("paletteNumberedName", { n: draft.length + 1 }),
      colors: [],
    };
    update([...draft, fresh]);
    onSelect(fresh.id);
  };

  const removePalette = (id: string) => {
    const next = draft.filter((p) => p.id !== id);
    update(next);
    if (selectedId === id) onSelect(next[0]?.id ?? null);
  };

  const renamePalette = (id: string, name: string) => {
    update(draft.map((p) => (p.id !== id ? p : { ...p, name: name.slice(0, 60) })));
  };

  const addColor = (id: string, raw: string) => {
    const hex = normaliseHex(raw);
    if (!hex) return;
    update(
      draft.map((p) => {
        if (p.id !== id) return p;
        if (p.colors.includes(hex)) return p;
        if (p.colors.length >= MAX_COLORS) return p;
        return { ...p, colors: [...p.colors, hex] };
      }),
    );
  };

  const removeColor = (id: string, idx: number) => {
    update(
      draft.map((p) =>
        p.id !== id ? p : { ...p, colors: p.colors.filter((_, i) => i !== idx) },
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.resolve(onChangePalettes(draft));
      setDirty(false);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("manageTitle")}</DialogTitle>
          <DialogDescription>{t("manageDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t("emptyHint")}
            </p>
          )}
          {draft.map((p) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={p.name}
                  onChange={(e) => renamePalette(p.id, e.target.value)}
                  placeholder={t("namePlaceholder")}
                  className="text-sm flex-1"
                  maxLength={60}
                />
                <button
                  type="button"
                  onClick={() => removePalette(p.id)}
                  className="text-destructive hover:bg-destructive/10 rounded p-1.5"
                  title={t("deletePalette")}
                  aria-label={t("deletePalette")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {p.colors.map((c, i) => (
                  <div key={i} className="relative group">
                    <span
                      className="block w-7 h-7 rounded-full border border-black/10"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                    <button
                      type="button"
                      onClick={() => removeColor(p.id, i)}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={t("removeColor")}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {p.colors.length < MAX_COLORS && (
                  <label
                    className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50"
                    title={t("addColor")}
                  >
                    <Plus className="w-3 h-3 text-muted-foreground" />
                    <input
                      type="color"
                      className="sr-only"
                      onChange={(e) => addColor(p.id, e.target.value)}
                      defaultValue="#5D6CDB"
                    />
                  </label>
                )}
                <span className="text-[10px] text-muted-foreground ml-1">
                  {t("colorCount", { n: p.colors.length, max: MAX_COLORS })}
                </span>
              </div>
            </div>
          ))}

          {draft.length < MAX_PALETTES && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPalette}
              className="w-full"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("newPalette")}
            </Button>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
