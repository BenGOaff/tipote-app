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
import {
  Target,
  CheckCircle2,
  ArrowRight,
  Layers,
  Clock,
  Plus,
  Users,
} from "lucide-react";

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
  offerPyramids: AnyRecord[];
  initialSelectedIndex: number;
  initialSelectedPyramid?: AnyRecord;
  planTasksCount: number;
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

function pickSelectedPyramid(
  offerPyramids: AnyRecord[],
  index: number,
  explicit?: AnyRecord,
) {
  if (explicit) return explicit;
  if (!Array.isArray(offerPyramids) || offerPyramids.length === 0) return null;
  if (typeof index !== "number" || index < 0 || index >= offerPyramids.length)
    return offerPyramids[0];
  return offerPyramids[index];
}

function pickFirstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = toStr(v).trim();
    if (s) return s;
  }
  return "—";
}

export default function StrategyLovable(props: StrategyLovableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const selectedPyramid = pickSelectedPyramid(
    (props.offerPyramids || []) as AnyRecord[],
    props.initialSelectedIndex ?? 0,
    props.initialSelectedPyramid as AnyRecord | undefined,
  );

  const lead = (selectedPyramid?.lead_magnet ??
    selectedPyramid?.leadMagnet ??
    null) as AnyRecord | null;
  const mid = (selectedPyramid?.low_ticket ??
    selectedPyramid?.middle_ticket ??
    selectedPyramid?.midTicket ??
    null) as AnyRecord | null;
  const high = (selectedPyramid?.high_ticket ??
    selectedPyramid?.highTicket ??
    null) as AnyRecord | null;

  const personaTitle = props.persona?.title || "—";
  const personaPains = Array.isArray(props.persona?.pains) ? props.persona.pains : [];
  const personaGoals = Array.isArray(props.persona?.desires)
    ? props.persona.desires
    : [];
  const personaChannels = Array.isArray(props.persona?.channels)
    ? props.persona.channels
    : [];

  // ✅ Local state: permet de cocher/décocher sans casser l’UX
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
            <Button variant="outline">Personnaliser</Button>
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
                <TabsTrigger value="pyramid">
                  Pyramide d&apos;offres
                </TabsTrigger>
                <TabsTrigger value="persona">Persona cible</TabsTrigger>
              </TabsList>

              {/* Plan d'action Tab */}
              <TabsContent value="plan" className="space-y-6">
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
                    <Progress value={props.progressionPercent} className="mt-3" />
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
                  {(props.phases || []).map((phase, phaseIndex) => {
                    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
                    const doneInPhase = tasks.filter((t) =>
                      isDoneStatus(statusById[String(t.id)] ?? t.status),
                    ).length;
                    const phaseProgress = tasks.length
                      ? Math.round((doneInPhase / tasks.length) * 100)
                      : 0;

                    return (
                      <Card key={phaseIndex} className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold">{phase.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {phase.period}
                            </p>
                          </div>
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
                        </div>
                        <Progress value={phaseProgress} className="mb-4" />

                        <div className="grid md:grid-cols-2 gap-3">
                          {tasks.length ? (
                            tasks.map((item) => {
                              const checked = isDoneStatus(
                                statusById[String(item.id)] ?? item.status,
                              );
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      toggleTask(String(item.id), Boolean(v))
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
                            })
                          ) : (
                            <div className="text-sm text-muted-foreground md:col-span-2">
                              Aucune tâche dans cette phase pour l&apos;instant.
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Next Step */}
                <Card className="p-5 bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-4">
                    <Target className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-primary mb-1">
                        Prochaine étape recommandée
                      </p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Continue ton exécution : synchronise ton plan puis avance
                        phase par phase.
                      </p>
                      <Button variant="default" size="sm">
                        Commencer <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Pyramide d'offres Tab */}
              <TabsContent value="pyramid" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <Layers className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Pyramide d&apos;offres</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="p-5 rounded-lg border-2 border-success bg-success/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-success">High Ticket</p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              high?.price,
                              (high as any)?.pricing?.price,
                              (high as any)?.tarif,
                            )}
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      </div>
                      <p className="text-muted-foreground mt-2">
                        {pickFirstNonEmpty(
                          high?.title,
                          (high as any)?.name,
                          (high as any)?.description,
                        )}
                      </p>
                    </div>

                    <div className="p-5 rounded-lg border-2 border-primary bg-primary/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-primary">Middle Ticket</p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              mid?.price,
                              (mid as any)?.pricing?.price,
                              (mid as any)?.tarif,
                            )}
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-muted-foreground mt-2">
                        {pickFirstNonEmpty(
                          mid?.title,
                          (mid as any)?.name,
                          (mid as any)?.description,
                        )}
                      </p>
                    </div>

                    <div className="p-5 rounded-lg border-2 border-secondary bg-secondary/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-secondary">Lead Magnet</p>
                          <p className="text-3xl font-bold mt-1">
                            {pickFirstNonEmpty(
                              lead?.price,
                              (lead as any)?.pricing?.price,
                              (lead as any)?.tarif,
                              "Gratuit",
                            )}
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-secondary" />
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
                    <Plus className="w-4 h-4 mr-2" />
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
                          {(personaChannels.length ? personaChannels : ["—"]).map(
                            (c, i) => (
                              <Badge key={i} variant="outline">
                                {c}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full mt-6">
                    Modifier le persona
                  </Button>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
