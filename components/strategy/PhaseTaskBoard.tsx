// components/strategy/PhaseTaskBoard.tsx
// Trello-inspired task board for a single phase page.
"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
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
import { TaskCard, type TaskCardData } from "./TaskCard";
import { TaskDetailModal, type TaskDetail } from "@/components/tasks/TaskDetailModal";
import type { Tag } from "@/components/tasks/TagSelector";
import type { Subtask } from "@/components/tasks/SubtaskList";
import {
  ArrowLeft,
  Plus,
  Loader2,
  CheckCircle2,
  Target,
} from "lucide-react";

interface PhaseTaskBoardProps {
  phaseTitle: string;
  phaseDescription: string;
  phasePeriod: string;
  phaseSlug: string;
  tasks: TaskCardData[];
}

export default function PhaseTaskBoard({
  phaseTitle,
  phaseDescription,
  phasePeriod,
  phaseSlug,
  tasks: initialTasks,
}: PhaseTaskBoardProps) {
  const t = useTranslations("phasePage");
  const td = useTranslations("phaseDetail");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  void pending;

  const [tasks, setTasks] = useState<TaskCardData[]>(initialTasks);
  const [newTaskName, setNewTaskName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Task detail modal state
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Computed
  const activeTasks = tasks.filter((tk) => tk.status !== "done");
  const doneTasks = tasks.filter((tk) => tk.status === "done");
  const totalDone = doneTasks.length;
  const totalAll = tasks.length;
  const progress = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // --- Handlers ---

  const toggleTask = useCallback(
    (taskId: string, done: boolean) => {
      const nextStatus = done ? "done" : "todo";
      setTasks((prev) =>
        prev.map((tk) => (tk.id === taskId ? { ...tk, status: nextStatus } : tk)),
      );
      startTransition(async () => {
        try {
          await fetch(`/api/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          });
          router.refresh();
        } catch {
          setTasks((prev) =>
            prev.map((tk) =>
              tk.id === taskId ? { ...tk, status: done ? "todo" : "done" } : tk,
            ),
          );
        }
      });
    },
    [router, startTransition],
  );

  const handlePriorityChange = useCallback(
    (taskId: string, priority: string) => {
      const newPriority = priority === "none" ? null : priority;
      setTasks((prev) =>
        prev.map((tk) => (tk.id === taskId ? { ...tk, priority: newPriority } : tk)),
      );
      fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      }).catch(() => {});
    },
    [],
  );

  const addTask = useCallback(async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setNewTaskName("");
    setIsAdding(true);
    const phaseKey = phaseSlug === "fondations" ? "p1" : phaseSlug === "croissance" ? "p2" : "p3";
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name, status: "todo", phase: phaseKey }),
      });
      const json = await res.json();
      if (json.ok && json.task) {
        setTasks((prev) => [
          ...prev,
          {
            id: json.task.id,
            title: json.task.title,
            description: null,
            status: "todo",
            priority: null,
            due_date: null,
            estimated_duration: null,
            tags: [],
            subtasks_total: 0,
            subtasks_done: 0,
          },
        ]);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  }, [newTaskName, phaseSlug, toast]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTasks((prev) => {
      const oldIndex = prev.findIndex((tk) => tk.id === active.id);
      const newIndex = prev.findIndex((tk) => tk.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      fetch("/api/tasks/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((tk) => tk.id) }),
      }).catch(() => {});
      return reordered;
    });
  }, []);

  // --- Task detail modal ---

  const openTaskDetail = useCallback(
    async (taskId: string) => {
      try {
        const [taskRes, tagsRes] = await Promise.all([
          fetch(`/api/tasks/${taskId}`).then((r) => r.json()),
          allTags.length === 0
            ? fetch("/api/tags").then((r) => r.json())
            : Promise.resolve({ tags: allTags }),
        ]);
        if (taskRes.ok && taskRes.task) {
          setTaskDetail(taskRes.task as TaskDetail);
          setTaskDetailOpen(true);
        }
        if (tagsRes.tags) setAllTags(tagsRes.tags);
      } catch {}
    },
    [allTags],
  );

  const handleTaskSave = useCallback(
    async (taskId: string, data: Record<string, unknown>) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        toast({ title: "Erreur", variant: "destructive" });
        return;
      }
      toast({ title: t("saved") });
      router.refresh();
    },
    [toast, t, router],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      setTasks((prev) => prev.filter((tk) => tk.id !== taskId));
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" }).catch(() => {});
      router.refresh();
    },
    [router],
  );

  const handleCreateTag = useCallback(async (name: string, color: string): Promise<Tag> => {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const json = await res.json();
    const tag = json.tag as Tag;
    setAllTags((prev) => [...prev, tag]);
    return tag;
  }, []);

  const handleAddSubtask = useCallback(async (taskId: string, title: string): Promise<Subtask> => {
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    return (await res.json()).subtask as Subtask;
  }, []);

  const handleToggleSubtask = useCallback(async (taskId: string, subtaskId: string, isDone: boolean) => {
    await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_done: isDone }),
    });
  }, []);

  const handleDeleteSubtask = useCallback(async (taskId: string, subtaskId: string) => {
    await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { method: "DELETE" });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 mt-1"
          onClick={() => router.push("/strategy")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-bold truncate">
            {phaseTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phaseDescription}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{td("progression")}</span>
        </div>
        <Progress value={progress} className="flex-1 h-2" />
        <Badge variant={progress === 100 ? "default" : "secondary"}>
          {totalDone}/{totalAll}
        </Badge>
      </div>

      {/* Add task input */}
      <div className="flex gap-2">
        <Input
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          placeholder={t("addTaskPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTask();
          }}
          disabled={isAdding}
        />
        <Button onClick={addTask} disabled={!newTaskName.trim() || isAdding} size="sm">
          {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Active tasks - Trello-style cards */}
      {activeTasks.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeTasks.map((tk) => tk.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onOpenDetail={openTaskDetail}
                  onPriorityChange={handlePriorityChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t("emptyPhase")}</p>
        </div>
      )}

      {/* Done tasks (collapsed) */}
      {doneTasks.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t("completedTasks", { count: doneTasks.length })}</span>
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
            {doneTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onOpenDetail={openTaskDetail}
                onPriorityChange={handlePriorityChange}
                isDraggable={false}
              />
            ))}
          </div>
        </details>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={taskDetail}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        allTags={allTags}
        onSave={handleTaskSave}
        onDelete={(id) => {
          deleteTask(id);
          setTaskDetailOpen(false);
        }}
        onCreateTag={handleCreateTag}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
      />
    </div>
  );
}
