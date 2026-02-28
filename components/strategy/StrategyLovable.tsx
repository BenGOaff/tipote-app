// components/strategy/StrategyLovable.tsx
"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { callStrategySSE } from "@/lib/strategySSE";

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
  Clock,
  Plus,
  Pencil,
  X,
  Save,
  ChevronRight,
  ChevronDown,
  Check,
  Trash2,
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

const TASKS_DISPLAY_LIMIT = 4;

export default function StrategyLovable(props: StrategyLovableProps) {
  const t = useTranslations("strategy");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  // ✅ NEW : génération plan (tolérant)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const handleGeneratePlan = useCallback(async () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);

    try {
      // Step 1: Generate strategy (offers + starter plan for "no offers" users)
      await callStrategySSE({});

      // Step 2: Check if offers were generated but not selected
      // This happens for "no offers" users — auto-select first pyramid + generate full strategy
      try {
        const checkRes = await fetch("/api/strategy/offer-pyramid")
          .then((r) => r.json())
          .catch(() => ({}));
        const offerPyramids = Array.isArray(checkRes?.offer_pyramids) ? checkRes.offer_pyramids : [];
        const hasSelection = checkRes?.selected_offer_pyramid_index !== null &&
          checkRes?.selected_offer_pyramid_index !== undefined;

        if (offerPyramids.length > 0 && !hasSelection) {
          // Auto-select first pyramid
          await fetch("/api/strategy/offer-pyramid", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedIndex: 0 }),
          }).catch(() => null);

          // Generate full strategy via SSE (heartbeats prevent 504 timeout)
          await callStrategySSE({});
        }
      } catch {
        // fail-open
      }

      // Step 3: Sync tasks after strategy generation
      await fetch("/api/tasks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);

      toast({
        title: t("toast.planReady"),
        description: t("toast.planReadyDesc"),
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
        title: t("toast.oops"),
        description: e instanceof Error ? e.message : t("toast.planError"),
        variant: "destructive",
      });
      setIsGeneratingPlan(false);
    }
  }, [isGeneratingPlan, router, toast, t]);

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
  const [showDoneTasks, setShowDoneTasks] = useState(false);

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

  // Revenue goal inline edit
  const [revenueGoalLocal, setRevenueGoalLocal] = useState(props.revenueGoal);
  const [isEditingRevGoal, setIsEditingRevGoal] = useState(false);
  const [revGoalInput, setRevGoalInput] = useState("");
  const [savingRevGoal, setSavingRevGoal] = useState(false);

  const handleSaveRevGoal = useCallback(async () => {
    const val = revGoalInput.trim();
    if (!val) return;
    setSavingRevGoal(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenue_goal_monthly: val }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: t("toast.error"), description: json?.error || t("toast.planError"), variant: "destructive" });
        return;
      }
      setRevenueGoalLocal(val);
      setIsEditingRevGoal(false);
      toast({ title: t("toast.saved"), description: t("toast.savedDesc") });
    } catch {
      toast({ title: t("toast.error"), description: t("toast.planError"), variant: "destructive" });
    } finally {
      setSavingRevGoal(false);
    }
  }, [revGoalInput, toast, t]);

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

          const reorderedTasks = arrayMove(phase.tasks, oldIndex, newIndex);
          newPhases[phaseIndex] = {
            ...phase,
            tasks: reorderedTasks,
          };

          // Persist new order to database
          const orderedIds = reorderedTasks.map((t) => t.id);
          fetch("/api/tasks/reorder", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds }),
          }).catch(() => {
            // Non-blocking
          });

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
      title: t("toast.saved"),
      description: t("toast.savedDesc"),
    });
  }, [phases, toast]);

  const deleteTask = useCallback(
    async (taskId: string) => {
      // UX instant
      setPhases((prev) =>
        prev.map((ph) => ({
          ...ph,
          tasks: (ph.tasks || []).filter((task) => String(task.id) !== String(taskId)),
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
            title: t("toast.error"),
            description: json?.error || t("toast.taskDeleteError"),
            variant: "destructive",
          });
          return;
        }

        toast({
          title: t("toast.taskDeleted"),
          description: t("toast.taskDeletedDesc"),
        });
      } catch {
        toast({
          title: t("toast.error"),
          description: t("toast.taskDeleteError"),
          variant: "destructive",
        });
      }
    },
    [toast, t],
  );

  const addTask = useCallback(
    async (taskName: string, phaseIndex: number) => {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: taskName,
            priority: "high",
            status: "todo",
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; task?: TaskRow; error?: string }
          | null;

        if (!res.ok || !json?.ok || !json?.task?.id) {
          toast({
            title: t("toast.error"),
            description: json?.error || t("toast.taskAddError"),
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
          title: t("toast.taskAdded"),
          description: t("toast.taskAddedDesc"),
        });
      } catch {
        toast({
          title: t("toast.error"),
          description: t("toast.taskAddError"),
          variant: "destructive",
        });
      }
    },
    [toast, t],
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
    (phaseIndex: number, _updatedPhase: { title: string; period: string; progress: number; tasks: { id: string; task: string; done: boolean }[] }) => {
      // Tasks are now persisted immediately via onAddTask/onDeleteTask
      // This callback just shows confirmation and refreshes
      toast({
        title: t("toast.phaseUpdated"),
        description: t("toast.phaseUpdatedDesc"),
      });
      router.refresh();
    },
    [toast, router],
  );

  // Wrapper for addTask that updates modal local state + persists via API
  const handleModalAddTask = useCallback(
    async (taskName: string, phaseIndex: number): Promise<{ id: string; task: string; done: boolean } | undefined> => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskName,
          priority: "high",
          status: "todo",
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; task?: TaskRow; error?: string }
        | null;

      if (!res.ok || !json?.ok || !json?.task?.id) {
        toast({
          title: t("toast.error"),
          description: json?.error || t("toast.taskAddError"),
          variant: "destructive",
        });
        throw new Error("Failed to add task");
      }

      // Update local phases state immediately
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

      // Return task in modal format so the modal can update localPhase immediately
      return {
        id: String(json.task!.id),
        task: json.task!.title || "—",
        done: false,
      };
    },
    [toast, router, t],
  );

  // Wrapper for deleteTask that persists via API
  const handleModalDeleteTask = useCallback(
    async (taskId: string) => {
      // Update local state immediately
      setPhases((prev) =>
        prev.map((ph) => ({
          ...ph,
          tasks: (ph.tasks || []).filter((task) => String(task.id) !== String(taskId)),
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
            title: t("toast.error"),
            description: json?.error || t("toast.taskDeleteError"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("toast.error"),
          description: t("toast.taskDeleteError"),
          variant: "destructive",
        });
      }

      router.refresh();
    },
    [toast, router, t],
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
              <h1 className="text-xl font-display font-bold">{t("title")}</h1>
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleCancelEditing}>
                  <X className="w-4 h-4 mr-2" />
                  {t("cancel")}
                </Button>
                <Button onClick={handleSaveChanges}>
                  <Save className="w-4 h-4 mr-2" />
                  {t("save")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleStartEditing}>
                <Pencil className="w-4 h-4 mr-2" />
                {t("customize")}
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
                      {t("generatingBanner.title")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("generatingBanner.desc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleGeneratePlan}
                      disabled={isGeneratingPlan}
                      size="sm"
                    >
                      {isGeneratingPlan ? t("generatingBanner.generating") : t("generatingBanner.generate")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.refresh()}
                    >
                      {t("generatingBanner.refresh")}
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
                    {t("overview.title")}
                  </h2>
                  <p className="text-primary-foreground/90 text-lg max-w-2xl">
                    {t("overview.subtitle")}
                  </p>
                </div>
                <Target className="w-16 h-16 text-primary-foreground/80 hidden lg:block" />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    {t("overview.revenueGoal")}
                  </p>
                  {isEditingRevGoal ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        autoFocus
                        value={revGoalInput}
                        onChange={(e) => setRevGoalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRevGoal();
                          if (e.key === "Escape") setIsEditingRevGoal(false);
                        }}
                        placeholder="ex: 3000 €/mois"
                        className="h-8 text-sm bg-white/10 border-white/30 text-primary-foreground placeholder:text-primary-foreground/40 focus-visible:ring-white/50"
                        disabled={savingRevGoal}
                      />
                      <button
                        onClick={handleSaveRevGoal}
                        disabled={savingRevGoal || !revGoalInput.trim()}
                        className="text-primary-foreground/80 hover:text-primary-foreground disabled:opacity-40 shrink-0"
                        aria-label="Enregistrer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsEditingRevGoal(false)}
                        className="text-primary-foreground/60 hover:text-primary-foreground shrink-0"
                        aria-label="Annuler"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold text-primary-foreground">
                        {revenueGoalLocal}
                      </p>
                      <button
                        onClick={() => { setRevGoalInput(revenueGoalLocal === "—" ? "" : revenueGoalLocal); setIsEditingRevGoal(true); }}
                        className="text-primary-foreground/40 hover:text-primary-foreground/80 transition-colors"
                        aria-label="Modifier l'objectif de revenu"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    {t("overview.horizon")}
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {props.horizon}
                  </p>
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    {t("overview.progression")}
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {props.progressionPercent}%
                  </p>
                </div>
              </div>
            </Card>

            {/* Plan d'action */}
            <div className="space-y-6">
                {/* Edit Mode Banner */}
                {isEditing && (
                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <div className="flex items-center gap-3">
                      <Pencil className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium text-primary">
                          {t("editBanner.title")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("editBanner.desc")}
                        </p>
                      </div>
                      <Button onClick={() => setIsAddTaskOpen(true)} size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        {t("editBanner.addTask")}
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
                      <span className="font-semibold">{t("progress.tasksCompleted")}</span>
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
                      <span className="font-semibold">{t("progress.daysRemaining")}</span>
                    </div>
                    <p className="text-3xl font-bold">{props.daysRemaining}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("progress.outOf90")}
                    </p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">{t("progress.currentPhase")}</span>
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
                    const activeTasks = tasks.filter((t) => !isDoneStatus(statusById[String(t.id)] ?? t.status));
                    const doneInPhase = tasks.filter((task) =>
                      isDoneStatus(statusById[String(task.id)] ?? task.status),
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
                        onClick={(e) => {
                          // Don't open modal if click was on a task checkbox row
                          if ((e.target as HTMLElement).closest?.("[data-task-row]")) return;
                          openPhase(phaseIndex);
                        }}
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
                            {activeTasks.length ? (
                              <DndContext
                                sensors={sensors}
                                onDragEnd={(e) => handleDragEnd(e, phaseIndex)}
                              >
                                <SortableContext
                                  items={activeTasks.map((t) => String(t.id))}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {activeTasks.map((t) => (
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
                                {t("noTasks")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {activeTasks.length ? (
                              <>
                                {activeTasks
                                  .slice(0, TASKS_DISPLAY_LIMIT)
                                  .map((item) => {
                                    const checked = isDoneStatus(
                                      statusById[String(item.id)] ?? item.status,
                                    );
                                    return (
                                      <div
                                        key={item.id}
                                        data-task-row
                                        className="group flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
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
                                          className={`flex-1 ${
                                            checked
                                              ? "line-through text-muted-foreground"
                                              : ""
                                          }`}
                                        >
                                          {item.title || "—"}
                                        </span>
                                        <button
                                          type="button"
                                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTask(String(item.id));
                                          }}
                                          title="Supprimer la tâche"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    );
                                  })}

                                {activeTasks.length > TASKS_DISPLAY_LIMIT && (
                                  <button
                                    type="button"
                                    className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPhase(phaseIndex);
                                    }}
                                  >
                                    {t("moreTasks", { count: activeTasks.length - TASKS_DISPLAY_LIMIT })}
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <div
                                className="text-sm text-muted-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t("noTasks")}
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>

                {/* Tâches terminées (archive) */}
                {(() => {
                  const allDone = (phasesForRender || []).flatMap((ph) =>
                    (ph.tasks || []).filter((task) =>
                      isDoneStatus(statusById[String(task.id)] ?? task.status)
                    )
                  );
                  if (allDone.length === 0) return null;
                  return (
                    <Card className="p-6">
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full text-left"
                        onClick={() => setShowDoneTasks(!showDoneTasks)}
                      >
                        <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                        <span className="font-semibold flex-1">
                          Tâches terminées
                        </span>
                        <Badge variant="secondary">{allDone.length}</Badge>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground transition-transform ${
                            showDoneTasks ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {showDoneTasks && (
                        <div className="mt-4 space-y-2">
                          {allDone.map((item) => (
                            <div
                              key={item.id}
                              data-task-row
                              className="group flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                            >
                              <Checkbox
                                checked
                                onCheckedChange={() =>
                                  toggleTask(String(item.id), false)
                                }
                              />
                              <span className="line-through text-muted-foreground flex-1">
                                {item.title || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })()}
            </div>
          </div>

          {selectedPhaseIndex !== null &&
            phasesForRender?.[selectedPhaseIndex] &&
            (() => {
              const ph = phasesForRender[selectedPhaseIndex] as Phase;
              const allTasksInPhase = Array.isArray(ph.tasks) ? ph.tasks : [];
              const activeTasksInPhase = allTasksInPhase.filter((t) => !isDoneStatus(statusById[String(t.id)] ?? t.status));
              const completed = allTasksInPhase.filter((task) =>
                isDoneStatus(statusById[String(task.id)] ?? task.status),
              ).length;
              const progress = allTasksInPhase.length
                ? Math.round((completed / allTasksInPhase.length) * 100)
                : 0;

              return (
                <PhaseDetailModal
                  isOpen={selectedPhaseIndex !== null}
                  onClose={() => setSelectedPhaseIndex(null)}
                  phase={{
                    title: ph.title,
                    period: ph.period,
                    progress,
                    tasks: activeTasksInPhase.map((t) => ({
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
                        t("offers.free"),
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
                revenueGoal: revenueGoalLocal,
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
                title: t("toast.personaUpdated"),
                description: t("toast.personaUpdatedDesc"),
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
