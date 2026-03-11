import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Target,
  Calendar,
  CheckCircle2,
  Pencil,
  X,
  ListChecks,
  Loader2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableTask, type SortableTaskModel } from "@/components/strategy/SortableTask";

interface Task extends SortableTaskModel {}

interface Phase {
  title: string;
  period: string;
  progress: number;
  tasks: Task[];
  description?: string;
  objectives?: string[];
}

interface PhaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  phase: Phase;
  phaseIndex: number;
  onUpdatePhase: (phaseIndex: number, phase: Phase) => void;
  onToggleTask?: (taskId: string, nextChecked: boolean) => void;
  onAddTask?: (taskName: string, phaseIndex: number) => Promise<Task | undefined>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onOpenDetail?: (taskId: string) => void;
}

/** Compute key objectives dynamically from the phase's actual tasks (not yet done) */
function computeObjectivesFromTasks(tasks: Task[]): string[] {
  const pending = tasks.filter((t) => !t.done);
  if (pending.length === 0) {
    return tasks.slice(0, 4).map((t) => t.task);
  }
  return pending.slice(0, 4).map((t) => t.task);
}

export const PhaseDetailModal = ({
  isOpen,
  onClose,
  phase,
  phaseIndex,
  onUpdatePhase,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onOpenDetail,
}: PhaseDetailModalProps) => {
  const t = useTranslations("phaseDetail");
  const [localPhase, setLocalPhase] = useState<Phase>(phase);
  const [isEditing, setIsEditing] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [savedPhase, setSavedPhase] = useState<Phase>(phase);
  const [isSaving, setIsSaving] = useState(false);

  // Sync when modal opens or phase changes
  useEffect(() => {
    if (!isOpen) return;
    setLocalPhase(phase);
    setSavedPhase(phase);
    setIsEditing(false);
    setNewTaskName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phaseIndex]);

  // Also sync when phase prop updates (e.g. after router.refresh)
  useEffect(() => {
    if (!isEditing && isOpen) {
      setLocalPhase(phase);
    }
  }, [phase, isEditing, isOpen]);

  // Resolve phase description from i18n based on phase index
  const phaseDescription = useMemo(() => {
    if (localPhase.description) return localPhase.description;
    const key = `phase${phaseIndex + 1}Desc` as const;
    try {
      return t(key);
    } catch {
      return "—";
    }
  }, [localPhase.description, phaseIndex, t]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const calculateProgress = useCallback((tasks: Task[]) => {
    const completedTasks = tasks.filter((tk) => tk.done).length;
    return tasks.length > 0
      ? Math.round((completedTasks / tasks.length) * 100)
      : 0;
  }, []);

  const handleToggleTask = useCallback(
    (taskId: string) => {
      if (isEditing) return;
      setLocalPhase((prev) => {
        const tasks = (prev.tasks || []).map((tk) =>
          tk.id === taskId ? { ...tk, done: !tk.done } : tk,
        );
        const progress = calculateProgress(tasks);
        const toggled = tasks.find((tk) => tk.id === taskId);
        if (toggled && onToggleTask) {
          onToggleTask(taskId, toggled.done);
        }
        return { ...prev, tasks, progress };
      });
    },
    [calculateProgress, isEditing, onToggleTask],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      setLocalPhase((prev) => {
        const tasks = (prev.tasks || []).filter((tk) => tk.id !== taskId);
        const progress = calculateProgress(tasks);
        return { ...prev, tasks, progress };
      });

      if (onDeleteTask) {
        try {
          await onDeleteTask(taskId);
        } catch {
          // Task already removed from UI
        }
      }
    },
    [calculateProgress, onDeleteTask],
  );

  const handleAddTask = useCallback(async () => {
    const name = newTaskName.trim();
    if (!name) return;

    setNewTaskName("");

    if (onAddTask) {
      setIsSaving(true);
      try {
        const newTask = await onAddTask(name, phaseIndex);
        if (newTask) {
          setLocalPhase((prev) => {
            const tasks = [...(prev.tasks || []), newTask];
            const progress = calculateProgress(tasks);
            return { ...prev, tasks, progress };
          });
        }
      } catch {
        // Error handled by parent
      } finally {
        setIsSaving(false);
      }
    } else {
      setLocalPhase((prev) => {
        const tasks = [
          ...(prev.tasks || []),
          { id: Math.random().toString(36).slice(2, 11), task: name, done: false },
        ];
        const progress = calculateProgress(tasks);
        return { ...prev, tasks, progress };
      });
    }
  }, [calculateProgress, newTaskName, onAddTask, phaseIndex]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalPhase((prev) => {
      const oldIndex = (prev.tasks || []).findIndex((tk) => tk.id === active.id);
      const newIndex = (prev.tasks || []).findIndex((tk) => tk.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const tasks = arrayMove(prev.tasks || [], oldIndex, newIndex);

      const orderedIds = tasks.map((tk) => tk.id);
      fetch("/api/tasks/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }).catch(() => {});

      return { ...prev, tasks };
    });
  }, []);

  const startEditing = useCallback(() => {
    setSavedPhase(localPhase);
    setIsEditing(true);
  }, [localPhase]);

  const cancelEditing = useCallback(() => {
    setLocalPhase(savedPhase);
    setIsEditing(false);
    setNewTaskName("");
  }, [savedPhase]);

  const saveEditing = useCallback(() => {
    const progress = calculateProgress(localPhase.tasks || []);
    const updated = { ...localPhase, progress };
    onUpdatePhase(phaseIndex, updated);
    setIsEditing(false);
    setNewTaskName("");
  }, [calculateProgress, localPhase, onUpdatePhase, phaseIndex]);

  const objectives =
    localPhase.objectives && localPhase.objectives.length > 0
      ? localPhase.objectives
      : (localPhase.tasks && localPhase.tasks.length > 0)
        ? computeObjectivesFromTasks(localPhase.tasks)
        : [t("noTasks")];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col max-h-[90vh]">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl sm:text-2xl font-display font-bold truncate">
                  {localPhase.title}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 shrink-0" />
                  {localPhase.period}
                </DialogDescription>
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("cancel")}</span>
                  </Button>
                  <Button size="sm" onClick={saveEditing}>
                    <CheckCircle2 className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("done")}</span>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={startEditing} className="shrink-0">
                  <Pencil className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t("edit")}</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="px-4 sm:px-6 pb-6 overflow-auto">
            <div className="space-y-6">
              {/* Objectif */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-primary shrink-0" />
                  <h4 className="font-semibold">{t("objective")}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {phaseDescription}
                </p>
              </div>

              <Separator />

              {/* Progression */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    <span className="font-semibold">{t("progression")}</span>
                  </div>
                  <Badge
                    variant={localPhase.progress === 100 ? "default" : "secondary"}
                  >
                    {localPhase.progress}%
                  </Badge>
                </div>
                <Progress value={localPhase.progress} />
              </div>

              <Separator />

              {/* Tâches */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">
                    {t("tasks")} ({localPhase.tasks?.length || 0})
                  </h4>
                </div>

                {isEditing && (
                  <div className="flex gap-2">
                    <Input
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      placeholder={t("newTask")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTask();
                      }}
                      disabled={isSaving}
                    />
                    <Button
                      size="sm"
                      onClick={handleAddTask}
                      disabled={!newTaskName.trim() || isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {localPhase.tasks?.length ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={(localPhase.tasks || []).map((tk) => tk.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {(localPhase.tasks || []).map((task) => (
                          <SortableTask
                            key={task.id}
                            task={task}
                            isEditing={isEditing}
                            onToggle={handleToggleTask}
                            onDelete={handleDeleteTask}
                            onOpenDetail={onOpenDetail}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t("noTasks")}
                    </div>
                  )}
                </div>

                {isEditing && localPhase.tasks?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {t("dragHint")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
