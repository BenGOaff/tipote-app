"use client";

// LanguageCombobox — branded, searchable picker for AI quiz generation.
//
// Uses the same self-contained pattern as ObjectivesDropdown (button +
// click-outside + panel) so it has zero new runtime dependencies and works
// identically in Tipote and Tiquiz. Backed by `lib/quizLanguages.ts`,
// which decouples generation language from UI locale.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  OTHER_QUIZ_LANGUAGES,
  POPULAR_QUIZ_LANGUAGES,
  QUIZ_LANGUAGES,
  getQuizLanguage,
  type QuizLanguage,
} from "@/lib/quizLanguages";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onValueChange: (next: string) => void;
  /** Visible label rendered above the trigger. Pass empty string to hide. */
  label?: string;
  /** Optional hint shown under the label. */
  hint?: string;
  /** Translatable strings. Falls back to French if not provided. */
  strings?: {
    placeholder?: string;
    searchPlaceholder?: string;
    popularHeading?: string;
    allHeading?: string;
    noResults?: string;
  };
  className?: string;
  /** Forwarded to the trigger for accessibility. */
  ariaLabel?: string;
};

const DEFAULT_STRINGS = {
  placeholder: "Choisis une langue",
  searchPlaceholder: "Rechercher une langue…",
  popularHeading: "Populaires",
  allHeading: "Toutes les langues",
  noResults: "Aucune langue ne correspond.",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matches(lang: QuizLanguage, q: string): boolean {
  if (!q) return true;
  const needle = normalize(q);
  return (
    normalize(lang.englishName).includes(needle) ||
    normalize(lang.nativeName).includes(needle) ||
    lang.code.toLowerCase().includes(needle)
  );
}

export function LanguageCombobox({
  value,
  onValueChange,
  label,
  hint,
  strings,
  className,
  ariaLabel,
}: Props) {
  const s = { ...DEFAULT_STRINGS, ...(strings ?? {}) };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = getQuizLanguage(value);

  // Filter + group: "popular" pinned first when no query, otherwise flat.
  const { popular, others, flat } = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return {
        popular: POPULAR_QUIZ_LANGUAGES,
        others: OTHER_QUIZ_LANGUAGES,
        flat: [...POPULAR_QUIZ_LANGUAGES, ...OTHER_QUIZ_LANGUAGES],
      };
    }
    const flatFiltered = QUIZ_LANGUAGES.filter((l) => matches(l, q));
    return {
      popular: flatFiltered.filter((l) => l.popular),
      others: flatFiltered.filter((l) => !l.popular),
      flat: flatFiltered,
    };
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Reset query + autofocus search when opening.
  useEffect(() => {
    if (open) {
      setQuery("");
      const idx = flat.findIndex((l) => l.code === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      // microtask so the input is in the DOM
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep active index in range when filter shrinks.
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(Math.max(0, flat.length - 1));
  }, [flat.length, activeIndex]);

  // Scroll active option into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-lang-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function commit(code: string) {
    onValueChange(code);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flat[activeIndex];
      if (target) commit(target.code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function renderOption(lang: QuizLanguage) {
    const isSelected = lang.code === value;
    const flatIndex = flat.findIndex((l) => l.code === lang.code);
    const isActive = flatIndex === activeIndex;
    return (
      <button
        key={lang.code}
        type="button"
        role="option"
        aria-selected={isSelected}
        data-lang-index={flatIndex}
        dir={lang.rtl ? "rtl" : "ltr"}
        onMouseEnter={() => setActiveIndex(flatIndex)}
        onClick={() => commit(lang.code)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors",
          isActive ? "bg-primary/8" : "hover:bg-muted",
          isSelected && "bg-primary/10",
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {lang.flag && (
            <span aria-hidden className="text-base leading-none shrink-0">
              {lang.flag}
            </span>
          )}
          <span className="flex flex-col min-w-0">
            <span
              className={cn(
                "text-sm font-medium leading-tight truncate",
                isSelected ? "text-primary" : "text-foreground",
              )}
            >
              {lang.nativeName}
            </span>
            {lang.englishName !== lang.nativeName && (
              <span className="text-[11px] text-muted-foreground leading-tight truncate">
                {lang.englishName}
              </span>
            )}
          </span>
        </span>
        {isSelected ? (
          <Check className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-mono shrink-0">
            {lang.code}
          </span>
        )}
      </button>
    );
  }

  const triggerLabel = selected?.nativeName ?? s.placeholder;

  return (
    <div ref={wrapperRef} className={cn("space-y-1.5 relative", className)}>
      {label && <Label>{label}</Label>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel ?? label ?? s.placeholder}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 border border-input rounded-lg px-3 py-2 text-sm bg-background text-left transition-colors",
          "hover:border-primary/40",
          open && "border-primary/60 ring-2 ring-primary/15",
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.flag ? (
            <span aria-hidden className="text-base leading-none shrink-0">
              {selected.flag}
            </span>
          ) : (
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span
            className={cn(
              "truncate",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
            dir={selected?.rtl ? "rtl" : "ltr"}
          >
            {triggerLabel}
          </span>
          {selected && selected.englishName !== selected.nativeName && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              · {selected.englishName}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
          role="dialog"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={s.searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-controls={listboxId}
              aria-autocomplete="list"
            />
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-72 overflow-y-auto p-2 space-y-3"
          >
            {flat.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {s.noResults}
              </p>
            )}

            {popular.length > 0 && (
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {s.popularHeading}
                </p>
                <div className="space-y-0.5">{popular.map(renderOption)}</div>
              </div>
            )}

            {others.length > 0 && (
              <div className="space-y-1">
                {popular.length > 0 && (
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                    {s.allHeading}
                  </p>
                )}
                <div className="space-y-0.5">{others.map(renderOption)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LanguageCombobox;
