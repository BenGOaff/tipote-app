"use client";

// QuizVarInserter — small "+ {name}" / "+ {m|f|x}" chips that insert
// personalization placeholders into a text field.
//
// Why this exists: the AI generates quiz copy with {name} and {m|f|x}
// already in place when the user enables those personalization options.
// If the user accidentally deletes one while editing, they need a
// frictionless way to re-insert it — without having to remember the
// exact syntax.
//
// Design:
// - Conditional: only the variables the user has actually enabled show up
//   (no UI noise for users who don't use personalization).
// - Insert-at-cursor: if the linked input/textarea is focused, the
//   placeholder lands at the caret position. Otherwise we fall back to
//   appending it.
// - `onMouseDown preventDefault` so clicking the chip doesn't steal focus
//   from the input we're trying to insert into.

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type QuizVarFlags = {
  name?: boolean;
  gender?: boolean;
};

/**
 * Compute the new text + caret position when inserting `insert` into
 * `current`, using the selection of the focused input/textarea (if any).
 * Falls back to appending with a single-space separator.
 */
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  insert: string,
): { value: string; cursor: number } {
  if (!el || document.activeElement !== el) {
    const sep = current && !/\s$/.test(current) ? " " : "";
    const value = `${current}${sep}${insert}`;
    return { value, cursor: value.length };
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const value = current.slice(0, start) + insert + current.slice(end);
  return { value, cursor: start + insert.length };
}

type Props = {
  vars: QuizVarFlags;
  onInsert: (placeholder: string) => void;
  className?: string;
  /** Compact = smaller chips for inline-with-input usage. */
  compact?: boolean;
};

export function QuizVarInserter({ vars, onInsert, className, compact }: Props) {
  const t = useTranslations("quizVars");
  if (!vars.name && !vars.gender) return null;

  const chipBase = cn(
    "inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 text-primary font-medium hover:bg-primary/10 hover:border-primary/40 transition-colors",
    compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
  );

  return (
    <div className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {vars.name && (
        <button
          type="button"
          // preventDefault keeps the linked input focused so we can insert at caret
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert("{name}")}
          className={chipBase}
          title={t("insertNameTitle")}
        >
          <span className="text-primary/60">+</span>
          <span className="font-mono">{"{name}"}</span>
        </button>
      )}
      {vars.gender && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert("{m|f|x}")}
          className={chipBase}
          title={t("insertGenderTitle")}
        >
          <span className="text-primary/60">+</span>
          <span className="font-mono">{"{m|f|x}"}</span>
        </button>
      )}
    </div>
  );
}

export default QuizVarInserter;
