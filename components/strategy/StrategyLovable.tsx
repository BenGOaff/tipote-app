// components/strategy/StrategyLovable.tsx
"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import {
  DndContext,
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

import { SortableTask } from "@/components/strategy/SortableTask";
import { AddTaskDialog } from "@/components/strategy/AddTaskDialog";

import {
  Target,
  CheckCircle2,
  Layers,
  Clock,
  Plus,
  Users,
  Pencil,
  X,
  Save,
  ChevronRight,
  Gift,
  Zap,
  Crown,
} from "lucide-react";

import { PhaseDetailModal } from "@/components/strategy/PhaseDetailModal";
import { OfferDetailModal } from "@/components/strategy/OfferDetailModal";
import { PersonaEditModal } from "@/components/strategy/PersonaEditModal";

type AnyRecord = Record<string, unknown>;

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Phase = {
  title: string;
  period: string;
  tasks: TaskRow[];
};

type StrategyLovableProps = {
  firstName: string;
  revenueGoal: string;
  horizon: string;
  progressionPercent: number;
  totalDone: number;
  totalAll: number;
  daysRemaining: number;
  currentPhase: number;
  currentPhaseLabel: string;
  phases: Phase[];
  persona: {
    title: string;
    pains: string[];
    desires: string[];
    channels: string[];
  };
  offerSets: AnyRecord[];
  initialSelectedIndex: number;
  initialSelectedOffers?: AnyRecord;
  planTasksCount: number;

  // ✅ nouveau (optionnel) : permet d’afficher un état “plan en cours”
  mode?: "ready" | "generating";
};

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(", ");
  return "";
}

function isDoneStatus(v: unknown) {
  const s = toStr(v).toLowerCase().trim();
  return (
    s === "done" ||
    s === "completed" ||
    s === "fait" ||
    s === "terminé" ||
    s === "termine"
  );
}

function pickSelectedOfferSet(
  offerSets: AnyRecord[],
  index: number,
  explicit?: AnyRecord,
) {
  if (explicit) return explicit;
  if (!Array.isArray(offerSets) || offerSets.length === 0) return null;
  if (typeof index !== "number" || index < 0 || index >= offerSets.length)
    return offerSets[0];
  return offerSets[index];
}

function pickFirstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = toStr(v).trim();
    if (s) return s;
  }
  return "—";
}

function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function phaseIndexToDueDate(phaseIndex: number): string {
  const today = new Date();
  if (phaseIndex === 0) return addDaysISO(today, 7);
  if (phaseIndex === 1) return addDaysISO(today, 37);
  return addDaysISO(today, 67);
}

const TASKS_DISPLAY_LIMIT = 4;

export default function StrategyLovable(props: StrategyLovableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  // ✅ NEW : génération plan (tolérant)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const handleGeneratePlan = useCallback(async () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);

    try {
      const res = await fetch("/api/strategy", { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && (data.error || data.message)) || `Erreur (${res.status})`;
        toast({
          title: "Impossible de générer le plan",
          description: String(msg),
          variant: "destructive",
        });
        setIsGeneratingPlan(false);
        return;
      }

      // ✅ Sync tasks after strategy generation so project_tasks is populated
      await fetch("/api/tasks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);

      toast({
        title: "C'est parti ✅",
        description: "Ton plan stratégique et tes tâches sont prêts.",
      });

      // refresh immédiat + "best effort"
      router.refresh();
      setTimeout(() => {
        try {
          router.refresh();
        } catch {}
      }, 1200);
    } catch (e) {
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Une erreur est survenue.",
        variant: "destructive",
      });
      setIsGeneratingPlan(false);
    }
  }, [isGeneratingPlan, router, toast]);

  // --- Sélection offres (inchangé) ---
  const selectedOfferSet = pickSelectedOfferSet(
    (props.offerSets || []) as AnyRecord[],
    props.initialSelectedIndex ?? 0,
    props.initialSelectedOffers as AnyRecord | undefined,
  );

  const lead = (selectedOfferSet?.lead_magnet ??
    selectedOfferSet?.leadMagnet ??
    null) as AnyRecord | null;
  const mid = (selectedOfferSet?.low_ticket ??
    selectedOfferSet?.middle_ticket ??
    selectedOfferSet?.midTicket ??
    null) as AnyRecord | null;
  const high = (selectedOfferSet?.high_ticket ??
    selectedOfferSet?.highTicket ??
    null) as AnyRecord | null;

  // ✅ Local state statuses (existant) : permet de cocher/décocher sans casser l'UX
  const initialStatusById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ph of props.phases || []) {
      for (const t of ph.tasks || []) {
        if (!t?.id) continue;
        map[String(t.id)] = String(t.status ?? "");
      }
    }
    return map;
  }, [props.phases]);

  const [statusById, setStatusById] =
    useState<Record<string, string>>(initialStatusById);

  // ✅ NEW : état local pour personnalisation (drag/drop, add, delete) sans casser le mode normal
  const [isEditing, setIsEditing] = useState(false);
  const [phases, setPhases] = useState<Phase[]>(props.phases || []);
  const [savedPhases, setSavedPhases] = useState<Phase[]>(props.phases || []);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  // ✅ NEW (Lovable): modales détails
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number | null>(
    null,
  );
  const [selectedOfferType, setSelectedOfferType] = useState<
    "lead_magnet" | "low_ticket" | "high_ticket" | null
  >(null);

  // Persona edit modal state
  const [isPersonaEditOpen, setIsPersonaEditOpen] = useState(false);
  const [localPersona, setLocalPersona] = useState(props.persona);

  // --- Persona derived values ---
  const personaTitle = localPersona?.title || "—";
  const personaPains = Array.isArray(localPersona?.pains)
    ? localPersona.pains
    : [];
  const personaGoals = Array.isArray(localPersona?.desires)
    ? localPersona.desires
    : [];
  const personaChannels = Array.isArray(localPersona?.channels)
    ? localPersona.channels
    : [];

  // Sync phases local si props changent (ex: router.refresh après toggle)
  // On ne force pas en mode édition pour éviter d'écraser l'ordre local en cours.
  useMemo(() => {
    if (!isEditing) {
      setPhases(props.phases || []);
      setSavedPhases(props.phases || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.phases]);

  // Sync persona when props change (after router.refresh)
  useMemo(() => {
    if (!isPersonaEditOpen) {
      setLocalPersona(props.persona);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.persona]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent, phaseIndex: number) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setPhases((prevPhases) => {
          const newPhases = [...prevPhases];
          const phase = newPhases[phaseIndex];
          const oldIndex = phase.tasks.findIndex((t) => t.id === active.id);
          const newIndex = phase.tasks.findIndex((t) => t.id === over.id);

          if (oldIndex < 0 || newIndex < 0) return prevPhases;

          newPhases[phaseIndex] = {
            ...phase,
            tasks: arrayMove(phase.tasks, oldIndex, newIndex),
          };

          return newPhases;
        });
      }
    },
    [],
  );

  const handleStartEditing = useCallback(() => {
    setSavedPhases(phases);
    setIsEditing(true);
  }, [phases]);

  const handleCancelEditing = useCallback(() => {
    setPhases(savedPhases);
    setIsEditing(false);
  }, [savedPhases]);

  const handleSaveChanges = useCallback(() => {
    // Ici on conserve le comportement Lovable : sauvegarde UX (ordre local + add/delete) sans casser l’existant.
    setSavedPhases(phases);
    setIsEditing(false);
    toast({
      title: "Modifications enregistrées",
      description: "Ta stratégie a été mise à jour avec succès",
    });
  }, [phases, toast]);

  const deleteTask = useCallback(
    async (taskId: string) => {
      // UX instant
      setPhases((prev) =>
        prev.map((ph) => ({
          ...ph,
          tasks: (ph.tasks || []).filter((t) => String(t.id) !== String(taskId)),
        })),
      );

      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || !json?.ok) {
          toast({
            title: "Erreur",
            description: json?.error || "Impossible de supprimer la tâche.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Tâche supprimée",
          description: "La tâche a bien été supprimée.",
        });
      } catch {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer la tâche.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const addTask = useCallback(
    async (taskName: string, phaseIndex: number) => {
      try {
        const due_date = phaseIndexToDueDate(phaseIndex);

        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: taskName,
            due_date,
            priority: "high",
            status: "todo",
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; task?: TaskRow; error?: string }
          | null;

        if (!res.ok || !json?.ok || !json?.task?.id) {
          toast({
            title: "Erreur",
            description: json?.error || "Impossible d'ajouter la tâche.",
            variant: "destructive",
          });
          return;
        }

        setPhases((prev) => {
          const next = [...prev];
          const ph = next[phaseIndex] ?? null;
          if (!ph) return prev;

          next[phaseIndex] = {
            ...ph,
            tasks: [...(ph.tasks || []), json.task as TaskRow],
          };
          return next;
        });

        toast({
          title: "Tâche ajoutée",
          description: "La tâche a bien été créée.",
        });
      } catch {
        toast({
          title: "Erreur",
          description: "Impossible d'ajouter la tâche.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const toggleTask = useCallback(
    (taskId: string, nextChecked: boolean) => {
      const nextStatus = nextChecked ? "done" : "todo";

      setStatusById((prev) => ({ ...prev, [taskId]: nextStatus }));

      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/tasks/${encodeURIComponent(taskId)}/status`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: nextStatus }),
            },
          );

          const json = (await res.json().catch(() => null)) as
            | { ok?: boolean; error?: string }
            | null;

          if (!res.ok || !json?.ok) {
            // rollback
            setStatusById((prev) => ({
              ...prev,
              [taskId]: nextChecked ? "todo" : "done",
            }));
            return;
          }

          // On garde le refresh en mode normal (pas de régression).
          router.refresh();
        } catch {
          setStatusById((prev) => ({
            ...prev,
            [taskId]: nextChecked ? "todo" : "done",
          }));
        }
      });
    },
    [router, startTransition],
  );

  // Pas d'UI pending (Lovable)
  void pending;

  const phasesForRender = isEditing ? phases : props.phases;

  const handleUpdatePhase = useCallback(
    (_phaseIndex: number, _updatedPhase: { title: string; period: string; progress: number; tasks: { id: string; task: string; done: boolean }[] }) => {
      // Tasks are now persisted immediately via onAddTask/onDeleteTask
      // This callback just shows confirmation and refreshes
      toast({
        title: "Phase mise à jour",
        description: "Les modifications ont été enregistrées",
      });
      router.refresh();
    },
    [toast, router],
  );

  // Wrapper for addTask that updates modal local state + persists via API
  const handleModalAddTask = useCallback(
    async (taskName: string, phaseIndex: number) => {
      const due_date = phaseIndexToDueDate(phaseIndex);

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskName,
          due_date,
          priority: "high",
          status: "todo",
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; task?: TaskRow; error?: string }
        | null;

      if (!res.ok || !json?.ok || !json?.task?.id) {
        toast({
          title: "Erreur",
          description: json?.error || "Impossible d'ajouter la tâche.",
          variant: "destructive",
        });
        throw new Error("Failed to add task");
      }

      // Update local phases state immediately so the modal reflects the change
      setPhases((prev) => {
        const next = [...prev];
        const ph = next[phaseIndex] ?? null;
        if (!ph) return prev;

        next[phaseIndex] = {
          ...ph,
          tasks: [...(ph.tasks || []), json.task as TaskRow],
        };
        return next;
      });

      // Refresh to sync server data
      router.refresh();
    },
    [toast, router],
  );

  // Wrapper for deleteTask that persists via API
  const handleModalDeleteTask = useCallback(
    async (taskId: string) => {
      // Update local state immediately
      setPhases((prev) =>
        prev.map((ph) => ({
          ...ph,
          tasks: (ph.tasks || []).filter((t) => String(t.id) !== String(taskId)),
        })),
      );

      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || !json?.ok) {
          toast({
            title: "Erreur",
            description: json?.error || "Impossible de supprimer la tâche.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer la tâche.",
          variant: "destructive",
        });
      }

      router.refresh();
    },
    [toast, router],
  );

  const openPhase = useCallback(
    (phaseIndex: number) => {
      if (isEditing) return;
      setSelectedPhaseIndex(phaseIndex);
    },
    [isEditing],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Ma Stratégie</h1>
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleCancelEditing}>
                  <X className="w-4 h-4 mr-2" />
                  Annuler
                </Button>
                <Button onClick={handleSaveChanges}>
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleStartEditing}>
                <Pencil className="w-4 h-4 mr-2" />
                Personnaliser
              </Button>
            )}
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* ✅ NEW : Bandeau “plan en cours” (sans casser le reste) */}
            {(props.mode === "generating" ||
              (!props.planTasksCount &&
                (!props.offerSets || props.offerSets.length === 0))) && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-primary">
                      Ton plan est en cours de préparation
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Si tu viens de terminer l’onboarding, c’est normal. Tu peux
                      lancer la génération maintenant.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleGeneratePlan}
                      disabled={isGeneratingPlan}
                      size="sm"
                    >
                      {isGeneratingPlan ? "Génération…" : "Générer mon plan"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.refresh()}
                    >
                      Rafraîchir
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Strategic Overview */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-display font-bold text-primary-foreground mb-3">
                    Ta vision stratégique
                  </h2>
                  <p className="text-primary-foreground/90 text-lg max-w-2xl">
                    Plan personnalisé généré par l&apos;IA pour atteindre tes
                    objectifs business
                  </p>
                </div>
                <Target className="w-16 h-16 text-primary-foreground/80 hidden lg:block" />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Objectif revenu
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {props.revenueGoal}
                  </p>
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Horizon
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {props.horizon}
                  </p>
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Progression
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {props.progressionPercent}%
                  </p>
                </div>
              </div>
            </Card>

            {/* Tabs for different views */}
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="plan">Plan d&apos;action</TabsTrigger>
                <TabsTrigger value="offers">
                  Tes offres
                </TabsTrigger>
                <TabsTrigger value="persona">Persona cible</TabsTrigger>
              </TabsList>

              {/* Plan d'action Tab */}
              <TabsContent value="plan" className="space-y-6">
                {/* Edit Mode Banner */}
                {isEditing && (
                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <div className="flex items-center gap-3">
                      <Pencil className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium text-primary">
                          Mode personnalisation
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Glisse les tâches pour les réorganiser, supprime celles
                          qui ne te conviennent pas, ou ajoute-en de nouvelles
                        </p>
                      </div>
                      <Button onClick={() => setIsAddTaskOpen(true)} size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter une tâche
                      </Button>
                    </div>
                  </Card>
                )}

                <AddTaskDialog
                  isOpen={isAddTaskOpen}
                  onClose={() => setIsAddTaskOpen(false)}
                  onAdd={addTask}
                  phases={(phasesForRender || []).map((p) => ({ title: p.title }))}
                />

                {/* Progress Overview */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Tâches complétées</span>
                    </div>
                    <p className="text-3xl font-bold">
                      {props.totalDone}/{props.totalAll}
                    </p>
                    <Progress
                      value={props.progressionPercent}
                      className="mt-3"
                    />
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Jours restants</span>
                    </div>
                    <p className="text-3xl font-bold">{props.daysRemaining}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sur 90 jours
                    </p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Phase actuelle</span>
                    </div>
                    <p className="text-3xl font-bold">{props.currentPhase}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {props.currentPhaseLabel}
                    </p>
                  </Card>
                </div>

                {/* Phases */}
                <div className="space-y-6">
                  {(phasesForRender || []).map((phase, phaseIndex) => {
                    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
                    const doneInPhase = tasks.filter((t) =>
                      isDoneStatus(statusById[String(t.id)] ?? t.status),
                    ).length;
                    const phaseProgress = tasks.length
                      ? Math.round((doneInPhase / tasks.length) * 100)
                      : 0;

                    return (
                      <Card
                        key={phaseIndex}
                        className={`p-6 ${
                          !isEditing
                            ? "cursor-pointer hover:bg-muted/20 transition-colors"
                            : ""
                        }`}
                        role={!isEditing ? "button" : undefined}
                        tabIndex={!isEditing ? 0 : undefined}
                        onClick={() => openPhase(phaseIndex)}
                        onKeyDown={(e) => {
                          if (isEditing) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPhase(phaseIndex);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold">{phase.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {phase.period}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={
                                phaseProgress === 100
                                  ? "default"
                                  : phaseProgress > 0
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {phaseProgress}%
                            </Badge>

                            {!isEditing && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPhase(phaseIndex);
                                }}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <Progress value={phaseProgress} className="mb-4" />

                        {isEditing ? (
                          <div className="grid md:grid-cols-2 gap-3">
                            {tasks.length ? (
                              <DndContext
                                sensors={sensors}
                                onDragEnd={(e) => handleDragEnd(e, phaseIndex)}
                              >
                                <SortableContext
                                  items={tasks.map((t) => String(t.id))}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {tasks.map((t) => (
                                    <SortableTask
                                      key={String(t.id)}
                                      task={{
                                        id: String(t.id),
                                        task: t.title || "—",
                                        done: isDoneStatus(
                                          statusById[String(t.id)] ?? t.status,
                                        ),
                                      }}
                                      isEditing
                                      onToggle={() => {}}
                                      onDelete={(id) => deleteTask(id)}
                                    />
                                  ))}
                                </SortableContext>
                              </DndContext>
                            ) : (
                              <div className="text-sm text-muted-foreground md:col-span-2">
                                Aucune tâche dans cette phase pour l&apos;instant.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {tasks.length ? (
                              <>
                                {tasks
                                  .slice(0, TASKS_DISPLAY_LIMIT)
                                  .map((item) => {
                                    const checked = isDoneStatus(
                                      statusById[String(item.id)] ?? item.status,
                                    );
                                    return (
                                      <div
                                        key={item.id}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onClick={(e) => e.stopPropagation()}
                                          onCheckedChange={(v) =>
                                            toggleTask(
                                              String(item.id),
                                              Boolean(v),
                                            )
                                          }
                                        />
                                        <span
                                          className={
                                            checked
                                              ? "line-through text-muted-foreground"
                                              : ""
                                          }
                                        >
                                          {item.title || "—"}
                                        </span>
                                      </div>
                                    );
                                  })}

                                {tasks.length > TASKS_DISPLAY_LIMIT && (
                                  <button
                                    type="button"
                                    className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPhase(phaseIndex);
                                    }}
                                  >
                                    Voir les{" "}
                                    {tasks.length - TASKS_DISPLAY_LIMIT} autres
                                    tâches
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <div
                                className="text-sm text-muted-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Aucune tâche dans cette phase pour l&apos;instant.
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Tes offres Tab */}
              <TabsContent value="offers" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <Layers className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Tes offres</h3>
                  </div>

                  <div className="space-y-4">
                    <div
                      className="p-5 rounded-lg border-2 border-success bg-success/5 cursor-pointer"
                      onClick={() => setSelectedOfferType("high_ticket")}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-success">
                            High Ticket
                          </p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              high?.price,
                              (high as any)?.pricing?.price,
                              (high as any)?.tarif,
                            )}
                          </p>
                        </div>
                        <Crown className="w-5 h-5 text-success" />
                      </div>
                      <p className="text-muted-foreground mt-2">
                        {pickFirstNonEmpty(
                          high?.title,
                          (high as any)?.name,
                          (high as any)?.description,
                        )}
                      </p>
                    </div>

                    <div
                      className="p-5 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer"
                      onClick={() => setSelectedOfferType("low_ticket")}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-primary">
                            Middle Ticket
                          </p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              mid?.price,
                              (mid as any)?.pricing?.price,
                              (mid as any)?.tarif,
                            )}
                          </p>
                        </div>
                        <Zap className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-muted-foreground mt-2">
                        {pickFirstNonEmpty(
                          mid?.title,
                          (mid as any)?.name,
                          (mid as any)?.description,
                        )}
                      </p>
                    </div>

                    <div
                      className="p-5 rounded-lg border-2 border-secondary bg-secondary/5 cursor-pointer"
                      onClick={() => setSelectedOfferType("lead_magnet")}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-secondary">
                            Lead Magnet
                          </p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              lead?.price,
                              (lead as any)?.pricing?.price,
                              (lead as any)?.tarif,
                              "Gratuit",
                            )}
                          </p>
                        </div>
                        <Gift className="w-5 h-5 text-secondary" />
                      </div>
                      <p className="text-muted-foreground mt-2">
                        {pickFirstNonEmpty(
                          lead?.title,
                          (lead as any)?.name,
                          (lead as any)?.description,
                        )}
                      </p>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full mt-6">
                    Ajouter une offre
                  </Button>
                </Card>
              </TabsContent>

              {/* Persona Tab */}
              <TabsContent value="persona" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-secondary flex items-center justify-center">
                      <Users className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Persona cible</h3>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Profil principal
                        </p>
                        <p className="font-semibold text-lg">{personaTitle}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Problèmes principaux
                        </p>
                        <ul className="space-y-2">
                          {(personaPains.length ? personaPains : ["—"]).map(
                            (p, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-2 h-2 rounded-full bg-destructive mt-2 flex-shrink-0" />
                                <span>{p}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Objectifs
                        </p>
                        <ul className="space-y-2">
                          {(personaGoals.length ? personaGoals : ["—"]).map(
                            (g, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-2 h-2 rounded-full bg-success mt-2 flex-shrink-0" />
                                <span>{g}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Canaux préférés
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(personaChannels.length
                            ? personaChannels
                            : ["—"]
                          ).map((c, i) => (
                            <Badge key={i} variant="outline">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full mt-6"
                    onClick={() => setIsPersonaEditOpen(true)}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Modifier le persona
                  </Button>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {selectedPhaseIndex !== null &&
            phasesForRender?.[selectedPhaseIndex] &&
            (() => {
              const ph = phasesForRender[selectedPhaseIndex] as Phase;
              const tasks = Array.isArray(ph.tasks) ? ph.tasks : [];
              const completed = tasks.filter((t) =>
                isDoneStatus(statusById[String(t.id)] ?? t.status),
              ).length;
              const progress = tasks.length
                ? Math.round((completed / tasks.length) * 100)
                : 0;

              return (
                <PhaseDetailModal
                  isOpen={selectedPhaseIndex !== null}
                  onClose={() => setSelectedPhaseIndex(null)}
                  phase={{
                    title: ph.title,
                    period: ph.period,
                    progress,
                    tasks: tasks.map((t) => ({
                      id: String(t.id),
                      task: t.title || "—",
                      done: isDoneStatus(statusById[String(t.id)] ?? t.status),
                    })),
                  }}
                  phaseIndex={selectedPhaseIndex}
                  onToggleTask={toggleTask}
                  onUpdatePhase={handleUpdatePhase}
                  onAddTask={handleModalAddTask}
                  onDeleteTask={handleModalDeleteTask}
                />
              );
            })()}

          {selectedOfferType && (
            <OfferDetailModal
              isOpen={!!selectedOfferType}
              onClose={() => setSelectedOfferType(null)}
              offer={
                selectedOfferType === "lead_magnet"
                  ? {
                      title: pickFirstNonEmpty(
                        lead?.title,
                        (lead as any)?.name,
                        "Lead Magnet",
                      ),
                      price: pickFirstNonEmpty(
                        lead?.price,
                        (lead as any)?.pricing?.price,
                        (lead as any)?.tarif,
                        "Gratuit",
                      ),
                      description: pickFirstNonEmpty(
                        lead?.composition,
                        (lead as any)?.description,
                        "",
                      ),
                      why: toStr((lead as any)?.purpose),
                      whyPrice: toStr((lead as any)?.insight),
                      whatToCreate: Array.isArray((lead as any)?.whatToCreate)
                        ? ((lead as any)?.whatToCreate as any[])
                        : undefined,
                      howToCreate: toStr((lead as any)?.howToCreate),
                      howToPromote: Array.isArray((lead as any)?.howToPromote)
                        ? ((lead as any)?.howToPromote as any[])
                        : undefined,
                    }
                  : selectedOfferType === "low_ticket"
                    ? {
                        title: pickFirstNonEmpty(
                          mid?.title,
                          (mid as any)?.name,
                          "Middle Ticket",
                        ),
                        price: pickFirstNonEmpty(
                          mid?.price,
                          (mid as any)?.pricing?.price,
                          (mid as any)?.tarif,
                        ),
                        description: pickFirstNonEmpty(
                          mid?.composition,
                          (mid as any)?.description,
                          "",
                        ),
                        why: toStr((mid as any)?.purpose),
                        whyPrice: toStr((mid as any)?.insight),
                      }
                    : {
                        title: pickFirstNonEmpty(
                          high?.title,
                          (high as any)?.name,
                          "High Ticket",
                        ),
                        price: pickFirstNonEmpty(
                          high?.price,
                          (high as any)?.pricing?.price,
                          (high as any)?.tarif,
                        ),
                        description: pickFirstNonEmpty(
                          high?.composition,
                          (high as any)?.description,
                          "",
                        ),
                        why: toStr((high as any)?.purpose),
                        whyPrice: toStr((high as any)?.insight),
                      }
              }
              offerType={selectedOfferType}
              profileData={{
                firstName: props.firstName,
                revenueGoal: props.revenueGoal,
                horizon: props.horizon,
              }}
            />
          )}

          <PersonaEditModal
            isOpen={isPersonaEditOpen}
            onClose={() => setIsPersonaEditOpen(false)}
            persona={localPersona}
            onSaved={(updated) => {
              setLocalPersona(updated);
              toast({
                title: "Persona mis à jour",
                description: "Les modifications ont été enregistrées",
              });
              // Delay refresh to ensure local state is committed first
              setTimeout(() => router.refresh(), 500);
            }}
          />
        </main>
      </div>
    </SidebarProvider>
  );
}
