"use client";

// LanguageCombobox — branded, searchable picker for AI quiz generation.
//
// Design notes addressing real user feedback:
// - Real flags via <img> from flagcdn.com. Emoji flag glyphs are unreliable
//   on Windows / Linux without flag fonts (they fall back to "FR", "DE",
//   etc. which looks broken).
// - One line per option: native name + the same name translated into the
//   user's UI locale via Intl.DisplayNames. We deliberately do NOT show
//   the English name to a French user — it would be redundant noise.
//   When both labels would be identical (the language matches the UI),
//   we show the native name only.
// - The panel automatically flips above the trigger when there isn't
//   enough room below, and caps its height to the available viewport
//   space so the list is always scrollable.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
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

// Min height we want to keep visible inside the panel (search bar + a few
// rows). If we have less than this in either direction, we still pick the
// largest of the two and let the inner list scroll.
const MIN_PANEL_HEIGHT = 240;
// Comfortable max so the list isn't a giant wall when there's lots of room.
const MAX_PANEL_HEIGHT = 420;
// Vertical breathing room from the viewport edge.
const VIEWPORT_MARGIN = 12;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // strip combining diacritics
    .replace(/\p{M}/gu, "");
}

function flagSrc(country?: string): string | null {
  if (!country) return null;
  // 40px wide, ~30px tall — perfect for a 16-20px display, retina-friendly.
  // flagcdn.com is a free, no-auth, fast-cached flag CDN.
  return `https://flagcdn.com/w40/${country.toLowerCase()}.png`;
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
  const uiLocale = useLocale();

  // Translator: language code -> name in the user's UI locale.
  // Falls back gracefully if the runtime doesn't support DisplayNames.
  const displayNames = useMemo(() => {
    if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) return null;
    try {
      return new Intl.DisplayNames([uiLocale], {
        type: "language",
        fallback: "code",
      });
    } catch {
      return null;
    }
  }, [uiLocale]);

  function localizedNameFor(lang: QuizLanguage): string | null {
    if (!displayNames) return null;
    try {
      const name = displayNames.of(lang.code);
      if (!name) return null;
      // Capitalize first letter so we get "Japonais" not "japonais".
      return name.charAt(0).toLocaleUpperCase(uiLocale) + name.slice(1);
    } catch {
      return null;
    }
  }

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [panelMaxHeight, setPanelMaxHeight] = useState(MAX_PANEL_HEIGHT);
  // Pixel coords of the trigger, captured on open / resize / scroll. We
  // use them to position the panel with `position: fixed` so it escapes
  // any clipping ancestor (e.g. a Card with overflow:hidden in the
  // settings page would otherwise crop the dropdown).
  const [triggerRect, setTriggerRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = getQuizLanguage(value);

  function matches(lang: QuizLanguage, q: string): boolean {
    if (!q) return true;
    const needle = normalize(q);
    const localized = localizedNameFor(lang) ?? "";
    return (
      normalize(lang.englishName).includes(needle) ||
      normalize(lang.nativeName).includes(needle) ||
      normalize(localized).includes(needle) ||
      lang.code.toLowerCase().includes(needle)
    );
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, uiLocale]);

  // Compute placement (above / below), max-height and pixel coords for
  // the (fixed-position) panel based on available viewport room.
  function recomputePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const spaceBelow = Math.max(0, vh - rect.bottom - VIEWPORT_MARGIN);
    const spaceAbove = Math.max(0, rect.top - VIEWPORT_MARGIN);

    // Prefer below by default. Flip up only if "below" is too cramped AND
    // "above" actually has more room — otherwise we'd flip into a worse spot.
    const flipUp = spaceBelow < MIN_PANEL_HEIGHT && spaceAbove > spaceBelow;
    const space = flipUp ? spaceAbove : spaceBelow;
    setPlacement(flipUp ? "top" : "bottom");
    setPanelMaxHeight(Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, space)));
    setTriggerRect({
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
    });
  }

  // Close on outside click + recompute on resize/scroll while open.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onResize() {
      recomputePosition();
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  // Reset query + autofocus search + position panel when opening.
  useEffect(() => {
    if (open) {
      setQuery("");
      const idx = flat.findIndex((l) => l.code === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      recomputePosition();
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

  function FlagOrGlobe({ country, size }: { country?: string; size: number }) {
    const src = flagSrc(country);
    if (!src) {
      return <Globe className="text-muted-foreground shrink-0" style={{ width: size, height: size }} />;
    }
    return (
      // Real PNG flag — renders identically across OS, no emoji font needed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        width={size}
        height={Math.round((size * 3) / 4)}
        className="rounded-sm shrink-0 object-cover ring-1 ring-border/40"
        style={{ width: size, height: Math.round((size * 3) / 4) }}
      />
    );
  }

  function renderOption(lang: QuizLanguage) {
    const isSelected = lang.code === value;
    const flatIndex = flat.findIndex((l) => l.code === lang.code);
    const isActive = flatIndex === activeIndex;
    const localized = localizedNameFor(lang);
    // Skip the secondary label if it would just duplicate the native name.
    const showSecondary = localized && localized.toLowerCase() !== lang.nativeName.toLowerCase();
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
          <FlagOrGlobe country={lang.country} size={20} />
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cn(
                "text-sm font-medium leading-tight truncate",
                isSelected ? "text-primary" : "text-foreground",
              )}
            >
              {lang.nativeName}
            </span>
            {showSecondary && (
              <span className="text-xs text-muted-foreground leading-tight truncate">
                · {localized}
              </span>
            )}
          </span>
        </span>
        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
      </button>
    );
  }

  const triggerLabel = selected?.nativeName ?? s.placeholder;
  const triggerSecondary =
    selected ? localizedNameFor(selected) : null;
  const showTriggerSecondary =
    triggerSecondary &&
    selected &&
    triggerSecondary.toLowerCase() !== selected.nativeName.toLowerCase();

  return (
    <div ref={wrapperRef} className={cn("space-y-1.5 relative", className)}>
      {label && <Label>{label}</Label>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <button
        ref={triggerRef}
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
          <FlagOrGlobe country={selected?.country} size={20} />
          <span
            className={cn(
              "truncate",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
            dir={selected?.rtl ? "rtl" : "ltr"}
          >
            {triggerLabel}
          </span>
          {showTriggerSecondary && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              · {triggerSecondary}
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

      {open && triggerRect && (
        <div
          // position: fixed escapes any clipping ancestor (e.g. a Card
          // with overflow:hidden in the settings page) — without that,
          // the dropdown gets cropped to its parent.
          className="fixed z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden flex flex-col"
          role="dialog"
          style={{
            left: triggerRect.left,
            width: triggerRect.width,
            ...(placement === "bottom"
              ? { top: triggerRect.bottom + 4 }
              : { top: Math.max(VIEWPORT_MARGIN, triggerRect.top - panelMaxHeight - 4) }),
            maxHeight: panelMaxHeight,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
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
            className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3"
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
