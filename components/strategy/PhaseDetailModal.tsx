import { useState, useCallback } from "react";
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
import {
  GripVertical,
  Trash2,
  Plus,
  Target,
  Calendar,
  CheckCircle2,
  Pencil,
  Save,
  X,
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors ${
        isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
      }`}
    >
      {isEditing && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
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
        className={`flex-1 ${task.done ? "line-through text-muted-foreground" : ""}`}
      >
        {task.task}
      </span>

      {isEditing && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};

const phaseDescriptions: Record<
  string,
  { description: string; objectives: string[] }
> = {
  "Phase 1 : Fondations": {
    description:
      "Cette phase vise à poser les bases solides de ton business. Tu vas créer les éléments essentiels qui vont attirer et capturer tes premiers prospects : un lead magnet irrésistible, une stratégie de contenu cohérente, et un système d'email marketing efficace.",
    objectives: [
      "Créer un lead magnet qui résout un problème précis de ton audience",
      "Mettre en place un système de capture d'emails automatisé",
      "Établir une présence régulière sur tes canaux de communication",
      "Lancer tes premières campagnes d'acquisition",
    ],
  },
  "Phase 2 : Croissance": {
    description:
      "Maintenant que les fondations sont en place, il est temps d'accélérer. Tu vas optimiser tes tunnels de vente, créer plus de contenu de valeur, et commencer à développer des partenariats stratégiques pour multiplier ta visibilité.",
    objectives: [
      "Lancer ton offre middle ticket pour convertir tes leads",
      "Optimiser tes pages de vente pour maximiser les conversions",
      "Produire du contenu vidéo pour augmenter l'engagement",
      "Développer des collaborations avec des influenceurs de ta niche",
    ],
  },
  "Phase 3 : Scale": {
    description:
      "C'est le moment de passer à l'échelle supérieure. Tu vas lancer ton offre premium, automatiser au maximum tes processus, et créer des systèmes qui génèrent des revenus de manière prévisible et scalable.",
    objectives: [
      "Lancer ton offre high ticket pour maximiser tes revenus",
      "Automatiser entièrement tes séquences de nurturing",
      "Organiser des webinars de vente à fort impact",
      "Créer un programme d'affiliation pour démultiplier tes ventes",
    ],
  },
};

export const PhaseDetailModal = ({
  isOpen,
  onClose,
  phase,
  phaseIndex,
  onUpdatePhase,
}: PhaseDetailModalProps) => {
  const [localPhase, setLocalPhase] = useState<Phase>(phase);
  const [isEditing, setIsEditing] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");

  const [savedPhase, setSavedPhase] = useState<Phase>(phase);

  const descriptionData =
    phaseDescriptions[localPhase.title] || phaseDescriptions[phase.title];

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
    return tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  }, []);

  const handleToggleTask = useCallback(
    (taskId: string) => {
      if (isEditing) return;
      setLocalPhase((prev) => {
        const tasks = prev.tasks.map((t) =>
          t.id === taskId ? { ...t, done: !t.done } : t,
        );
        const progress = calculateProgress(tasks);
        const updated = { ...prev, tasks, progress };
        onUpdatePhase(phaseIndex, updated);
        return updated;
      });
    },
    [calculateProgress, isEditing, onUpdatePhase, phaseIndex],
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      setLocalPhase((prev) => {
        const tasks = prev.tasks.filter((t) => t.id !== taskId);
        const progress = calculateProgress(tasks);
        return { ...prev, tasks, progress };
      });
    },
    [calculateProgress],
  );

  const handleAddTask = useCallback(() => {
    const name = newTaskName.trim();
    if (!name) return;

    setLocalPhase((prev) => {
      const tasks = [
        ...(prev.tasks || []),
        { id: Math.random().toString(36).slice(2, 11), task: name, done: false },
      ];
      const progress = calculateProgress(tasks);
      return { ...prev, tasks, progress };
    });

    setNewTaskName("");
  }, [calculateProgress, newTaskName]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalPhase((prev) => {
      const oldIndex = prev.tasks.findIndex((t) => t.id === active.id);
      const newIndex = prev.tasks.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const tasks = arrayMove(prev.tasks, oldIndex, newIndex);
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
  }, [savedPhase]);

  const saveEditing = useCallback(() => {
    const progress = calculateProgress(localPhase.tasks);
    const updated = { ...localPhase, progress };
    onUpdatePhase(phaseIndex, updated);
    setIsEditing(false);
  }, [calculateProgress, localPhase, onUpdatePhase, phaseIndex]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
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
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer
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

        <div className="space-y-6">
          {/* Description */}
          <div className="p-4 rounded-xl bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Objectif de cette phase</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {localPhase.description || descriptionData?.description || "—"}
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span className="font-semibold">Progression</span>
            </div>
            <Badge variant={localPhase.progress === 100 ? "default" : "secondary"}>
              {localPhase.progress}%
            </Badge>
          </div>
          <Progress value={localPhase.progress} />

          {/* Objectives */}
          <div>
            <h4 className="font-semibold mb-3">Points clés à accomplir</h4>
            <ul className="space-y-2">
              {(localPhase.objectives ||
                descriptionData?.objectives ||
                ["—"]
              ).map((obj, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-sm">{obj}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Tâches ({localPhase.tasks.length})</h4>
              {isEditing && (
                <Button size="sm" onClick={handleAddTask}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              )}
            </div>

            {isEditing && (
              <div className="flex gap-2 mb-4">
                <Input
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="Nouvelle tâche..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTask();
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              {localPhase.tasks.length ? (
                isEditing ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localPhase.tasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localPhase.tasks.map((task) => (
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
                  localPhase.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={() => handleToggleTask(task.id)}
                      />
                      <span
                        className={
                          task.done ? "line-through text-muted-foreground" : ""
                        }
                      >
                        {task.task}
                      </span>
                    </div>
                  ))
                )
              ) : (
                <div className="text-sm text-muted-foreground">
                  Aucune tâche pour l'instant.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
