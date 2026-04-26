"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { QuizVarInserter, insertAtCursor, type QuizVarFlags } from "@/components/quiz/QuizVarInserter";

type QuizOption = { text: string; result_index: number };
type QuizQuestion = { question_text: string; options: QuizOption[] };

interface SortableQuestionProps {
  id: string;
  index: number;
  question: QuizQuestion;
  resultsCount: number;
  canDelete: boolean;
  vars?: QuizVarFlags;
  onUpdate: (patch: Partial<QuizQuestion>) => void;
  onUpdateOption: (oIdx: number, patch: Partial<QuizOption>) => void;
  onAddOption: () => void;
  onRemoveOption: (oIdx: number) => void;
  onRemove: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

function SortableQuestion({
  id, index, question, resultsCount, canDelete, vars,
  onUpdate, onUpdateOption, onAddOption, onRemoveOption, onRemove, t,
}: SortableQuestionProps) {
  const tEditor = useTranslations("quizEditor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // One ref per editable text input — used by the variable inserter to
  // place the placeholder at the current caret position.
  const questionInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLInputElement | null>>([]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const showVars = Boolean(vars && (vars.name || vars.gender));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-3 p-4 rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted touch-none"
          aria-label={tEditor("reorder")}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Label className="text-base font-semibold flex-1">
          {t("questionLabel", { n: index + 1 })}
        </Label>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Input
          ref={questionInputRef}
          value={question.question_text}
          onChange={(e) => onUpdate({ question_text: e.target.value })}
          placeholder={t("questionPlaceholder")}
          className="text-base"
        />
        {showVars && (
          <QuizVarInserter
            vars={vars!}
            compact
            onInsert={(placeholder) => {
              const { value, cursor } = insertAtCursor(
                questionInputRef.current,
                question.question_text,
                placeholder,
              );
              onUpdate({ question_text: value });
              requestAnimationFrame(() => {
                const el = questionInputRef.current;
                if (!el) return;
                el.focus();
                try { el.setSelectionRange(cursor, cursor); } catch { /* ignore */ }
              });
            }}
          />
        )}
      </div>

      <div className="space-y-2 pl-4 border-l-2 border-primary/20">
        {question.options.map((option, oIdx) => (
          <div key={oIdx} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{String.fromCharCode(65 + oIdx)}</span>
              <Input
                ref={(el) => { optionRefs.current[oIdx] = el; }}
                className="flex-1"
                value={option.text}
                onChange={(e) => onUpdateOption(oIdx, { text: e.target.value })}
                placeholder={t("optionPlaceholder", { n: oIdx + 1 })}
              />
              <select
                value={option.result_index}
                onChange={(e) => onUpdateOption(oIdx, { result_index: Number(e.target.value) })}
                className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background w-20 shrink-0"
                title={t("mapsToResult")}
              >
                {Array.from({ length: resultsCount }, (_, rIdx) => (
                  <option key={rIdx} value={rIdx}>→ R{rIdx + 1}</option>
                ))}
              </select>
              {question.options.length > 2 && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onRemoveOption(oIdx)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
            {showVars && (
              <QuizVarInserter
                className="pl-7"
                vars={vars!}
                compact
                onInsert={(placeholder) => {
                  const { value, cursor } = insertAtCursor(
                    optionRefs.current[oIdx] ?? null,
                    option.text,
                    placeholder,
                  );
                  onUpdateOption(oIdx, { text: value });
                  requestAnimationFrame(() => {
                    const el = optionRefs.current[oIdx];
                    if (!el) return;
                    el.focus();
                    try { el.setSelectionRange(cursor, cursor); } catch { /* ignore */ }
                  });
                }}
              />
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={onAddOption} className="mt-1">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("addOption")}
        </Button>
      </div>
    </div>
  );
}

interface SortableQuestionListProps {
  questions: QuizQuestion[];
  resultsCount: number;
  onReorder: (questions: QuizQuestion[]) => void;
  onUpdate: (idx: number, patch: Partial<QuizQuestion>) => void;
  onUpdateOption: (qIdx: number, oIdx: number, patch: Partial<QuizOption>) => void;
  onAddOption: (qIdx: number) => void;
  onRemoveOption: (qIdx: number, oIdx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  /** Personalization placeholders the user can insert into question/option text. */
  vars?: QuizVarFlags;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export default function SortableQuestionList({
  questions, resultsCount, onReorder, onUpdate, onUpdateOption,
  onAddOption, onRemoveOption, onAdd, onRemove, t, vars,
}: SortableQuestionListProps) {
  const ids = questions.map((_, i) => `q-${i}`);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    onReorder(arrayMove(questions, oldIndex, newIndex));
  }

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {questions.map((question, qIdx) => (
            <SortableQuestion
              key={ids[qIdx]}
              id={ids[qIdx]}
              index={qIdx}
              question={question}
              resultsCount={resultsCount}
              canDelete={questions.length > 1}
              vars={vars}
              onUpdate={(patch) => onUpdate(qIdx, patch)}
              onUpdateOption={(oIdx, patch) => onUpdateOption(qIdx, oIdx, patch)}
              onAddOption={() => onAddOption(qIdx)}
              onRemoveOption={(oIdx) => onRemoveOption(qIdx, oIdx)}
              onRemove={() => onRemove(qIdx)}
              t={t}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button variant="outline" onClick={onAdd} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        {t("addQuestion")}
      </Button>
    </div>
  );
}
