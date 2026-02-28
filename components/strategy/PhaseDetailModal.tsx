import { useState, useCallback, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  GripVertical,
  Trash2,
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Task {
  id: string;
  task: string;
  done: boolean;
}

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
}

const SortableTaskItem = ({
  task,
  isEditing,
  onToggle,
  onDelete,
}: {
  task: Task;
  isEditing: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3",
        "transition-colors hover:bg-muted/30",
        isDragging ? "shadow-lg ring-2 ring-primary/20" : "",
      ].join(" ")}
    >
      {isEditing && (
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-muted"
          aria-label="Déplacer la tâche"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      <Checkbox
        checked={task.done}
        onCheckedChange={() => onToggle(task.id)}
        disabled={isEditing}
      />

      <span
        className={[
          "flex-1 text-sm",
          task.done ? "line-through text-muted-foreground" : "",
        ].join(" ")}
      >
        {task.task}
      </span>

      {isEditing && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(task.id)}
          aria-label="Supprimer la tâche"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};

const phaseDescriptions: Record<string, { description: string }> =
  {
    "Phase 1 : Fondations": {
      description:
        "Cette phase vise à poser les bases solides de ton business. Tu vas créer les éléments essentiels qui vont attirer et capturer tes premiers prospects.",
    },
    "Phase 2 : Croissance": {
      description:
        "Maintenant que les fondations sont en place, il est temps d'accélérer. Tu vas optimiser tes tunnels de vente et développer ta visibilité.",
    },
    "Phase 3 : Scale": {
      description:
        "C'est le moment de passer à l'échelle supérieure. Tu vas automatiser tes processus et créer des systèmes de revenus prévisibles.",
    },
  };

/** Compute key objectives dynamically from the phase's actual tasks (not yet done) */
function computeObjectivesFromTasks(tasks: Task[]): string[] {
  // Show up to 4 non-completed tasks as key objectives
  const pending = tasks.filter((t) => !t.done);
  if (pending.length === 0) {
    // All done — show completed tasks as accomplished objectives
    return tasks.slice(0, 4).map((t) => t.task);
  }
  // Prioritize high-priority tasks first, then show in order
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
}: PhaseDetailModalProps) => {
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

  const descriptionData = useMemo(() => {
    return phaseDescriptions[localPhase.title] || phaseDescriptions[phase.title];
  }, [localPhase.title, phase.title]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const calculateProgress = useCallback((tasks: Task[]) => {
    const completedTasks = tasks.filter((t) => t.done).length;
    return tasks.length > 0
      ? Math.round((completedTasks / tasks.length) * 100)
      : 0;
  }, []);

  const handleToggleTask = useCallback(
    (taskId: string) => {
      if (isEditing) return;
      setLocalPhase((prev) => {
        const tasks = (prev.tasks || []).map((t) =>
          t.id === taskId ? { ...t, done: !t.done } : t,
        );
        const progress = calculateProgress(tasks);
        const toggled = tasks.find((t) => t.id === taskId);
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
      // Immediately update local UI
      setLocalPhase((prev) => {
        const tasks = (prev.tasks || []).filter((t) => t.id !== taskId);
        const progress = calculateProgress(tasks);
        return { ...prev, tasks, progress };
      });

      // Persist via API if callback provided
      if (onDeleteTask) {
        try {
          await onDeleteTask(taskId);
        } catch {
          // Task already removed from UI - acceptable
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
      // Persist via API — parent handles DB + phases state
      setIsSaving(true);
      try {
        const newTask = await onAddTask(name, phaseIndex);
        // Update localPhase immediately so the task appears without closing the modal
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
      // Fallback: local-only add (legacy behavior)
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
      const oldIndex = (prev.tasks || []).findIndex((t) => t.id === active.id);
      const newIndex = (prev.tasks || []).findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const tasks = arrayMove(prev.tasks || [], oldIndex, newIndex);

      // Persist new order to database
      const orderedIds = tasks.map((t) => t.id);
      fetch("/api/tasks/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }).catch(() => {
        // Non-blocking: order is still visible locally
      });

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
    // Tasks are already persisted via onAddTask/onDeleteTask during editing
    // Just exit editing mode and notify parent
    const progress = calculateProgress(localPhase.tasks || []);
    const updated = { ...localPhase, progress };
    onUpdatePhase(phaseIndex, updated);
    setIsEditing(false);
    setNewTaskName("");
  }, [calculateProgress, localPhase, onUpdatePhase, phaseIndex]);

  const objectiveText =
    localPhase.description || descriptionData?.description || "—";
  // ✅ FIX: Compute key objectives dynamically from actual tasks
  // instead of hardcoded generic objectives
  const objectives =
    localPhase.objectives && localPhase.objectives.length > 0
      ? localPhase.objectives
      : (localPhase.tasks && localPhase.tasks.length > 0)
        ? computeObjectivesFromTasks(localPhase.tasks)
        : ["Aucune tâche pour l'instant"];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-2xl font-display font-bold">
                  {localPhase.title}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4" />
                  {localPhase.period}
                </DialogDescription>
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={cancelEditing}>
                    <X className="w-4 h-4 mr-2" />
                    Annuler
                  </Button>
                  <Button onClick={saveEditing}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Terminé
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={startEditing}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="px-6 pb-6 overflow-auto">
            <div className="space-y-6">
              {/* Objectif */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold">Objectif de cette phase</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {objectiveText}
                </p>
              </div>

              <Separator />

              {/* Progression */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="font-semibold">Progression</span>
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

              {/* Points clés */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ListChecks className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold">Points clés à accomplir</h4>
                </div>
                <ul className="space-y-2">
                  {objectives.map((obj, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-sm">{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              {/* Tâches */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">
                    Tâches ({localPhase.tasks?.length || 0})
                  </h4>
                </div>

                {isEditing && (
                  <div className="flex gap-2">
                    <Input
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      placeholder="Nouvelle tâche..."
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
                    isEditing ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={(localPhase.tasks || []).map((t) => t.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {(localPhase.tasks || []).map((task) => (
                            <SortableTaskItem
                              key={task.id}
                              task={task}
                              isEditing
                              onToggle={handleToggleTask}
                              onDelete={handleDeleteTask}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      (localPhase.tasks || []).map((task) => (
                        <div
                          key={task.id}
                          className={[
                            "group w-full text-left flex items-center gap-3 rounded-xl border",
                            "bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/30 cursor-pointer",
                          ].join(" ")}
                          onClick={() => handleToggleTask(task.id)}
                        >
                          <Checkbox
                            checked={task.done}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => handleToggleTask(task.id)}
                          />
                          <span
                            className={[
                              "flex-1 text-sm",
                              task.done
                                ? "line-through text-muted-foreground"
                                : "",
                            ].join(" ")}
                          >
                            {task.task}
                          </span>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            aria-label="Supprimer la tâche"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Aucune tâche pour l&apos;instant.
                    </div>
                  )}
                </div>

                {isEditing && localPhase.tasks?.length ? (
                  <p className="text-xs text-muted-foreground">
                    Astuce : tu peux réordonner les tâches en les glissant.
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
