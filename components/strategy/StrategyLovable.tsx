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
  TrendingUp,
  Users,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  Edit3,
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
  const s = toStr(v).toLowerCase();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
}

function pickSelectedPyramid(offerPyramids: AnyRecord[], index: number, explicit?: AnyRecord) {
  if (explicit) return explicit;
  if (!Array.isArray(offerPyramids) || offerPyramids.length === 0) return null;
  if (typeof index !== "number" || index < 0 || index >= offerPyramids.length) return offerPyramids[0];
  return offerPyramids[index];
}

export default function StrategyLovable(props: StrategyLovableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const selectedPyramid = pickSelectedPyramid(
    (props.offerPyramids || []) as AnyRecord[],
    props.initialSelectedIndex ?? 0,
    props.initialSelectedPyramid as AnyRecord | undefined,
  );

  const lead = (selectedPyramid?.lead_magnet ?? null) as AnyRecord | null;
  const mid = (selectedPyramid?.low_ticket ?? null) as AnyRecord | null;
  const high = (selectedPyramid?.high_ticket ?? null) as AnyRecord | null;

  const personaTitle = props.persona?.title || "—";
  const personaPains = Array.isArray(props.persona?.pains) ? props.persona.pains : [];
  const personaGoals = Array.isArray(props.persona?.desires) ? props.persona.desires : [];
  const personaChannels = Array.isArray(props.persona?.channels) ? props.persona.channels : [];

  // ✅ Local state: permet de cocher/décocher sans casser le DOM Lovable
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

  const [statusById, setStatusById] = useState<Record<string, string>>(initialStatusById);

  const toggleTask = useCallback(
    (taskId: string, nextChecked: boolean) => {
      const nextStatus = nextChecked ? "done" : "todo";

      setStatusById((prev) => ({ ...prev, [taskId]: nextStatus }));

      startTransition(async () => {
        try {
          const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          });

          const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

          if (!res.ok || !json?.ok) {
            // rollback
            setStatusById((prev) => ({ ...prev, [taskId]: nextChecked ? "todo" : "done" }));
            return;
          }

          // refresh pour recalcul server-side progress / compteurs si besoin
          router.refresh();
        } catch {
          setStatusById((prev) => ({ ...prev, [taskId]: nextChecked ? "todo" : "done" }));
        }
      });
    },
    [router, startTransition],
  );

  // Pas d'UI pending (Lovable)
  void pending;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1">
          <div className="flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <h1 className="text-xl font-semibold">Ma Stratégie</h1>
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="rounded-full">
                <Edit3 className="mr-2 h-4 w-4" />
                Personnaliser
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-900 p-8 text-white">
              <div className="absolute right-8 top-8 opacity-20">
                <Target className="h-16 w-16" />
              </div>

              <h2 className="text-4xl font-bold mb-2">Votre Vision Stratégique</h2>
              <p className="text-indigo-100 text-lg mb-8">
                Plan personnalisé généré par l&apos;IA pour atteindre vos objectifs business
              </p>

              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm opacity-90">Objectif Revenu</span>
                  </div>
                  <div className="text-2xl font-bold">{props.revenueGoal}</div>
                </div>

                <div className="bg-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm opacity-90">Horizon</span>
                  </div>
                  <div className="text-2xl font-bold">{props.horizon}</div>
                </div>

                <div className="bg-white/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm opacity-90">Progression</span>
                  </div>
                  <div className="text-2xl font-bold">{props.progressionPercent}%</div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="action" className="w-full">
              <TabsList className="grid w-fit grid-cols-3">
                <TabsTrigger value="action">Plan d&apos;action</TabsTrigger>
                <TabsTrigger value="pyramid">Pyramide d&apos;offres</TabsTrigger>
                <TabsTrigger value="persona">Persona cible</TabsTrigger>
              </TabsList>

              <TabsContent value="action" className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-indigo-100 p-2 rounded-lg">
                        <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                      </div>
                      <span className="font-medium">Tâches complétées</span>
                    </div>
                    <div className="text-3xl font-bold mb-2">
                      {props.totalDone}/{props.totalAll}
                    </div>
                    <Progress value={props.progressionPercent} className="h-2" />
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-indigo-100 p-2 rounded-lg">
                        <Clock className="h-5 w-5 text-indigo-600" />
                      </div>
                      <span className="font-medium">Jours restants</span>
                    </div>
                    <div className="text-3xl font-bold mb-2">{props.daysRemaining}</div>
                    <div className="text-sm text-muted-foreground">Sur 90 jours</div>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-green-100 p-2 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                      </div>
                      <span className="font-medium">Phase actuelle</span>
                    </div>
                    <div className="text-3xl font-bold mb-2">{props.currentPhase}</div>
                    <div className="text-sm text-muted-foreground">{props.currentPhaseLabel}</div>
                  </Card>
                </div>

                {props.phases.map((phase, idx) => {
                  const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
                  const doneInPhase = tasks.filter((t) => isDoneStatus(statusById[String(t.id)] ?? t.status)).length;
                  const phaseProgress = tasks.length ? Math.round((doneInPhase / tasks.length) * 100) : 0;

                  return (
                    <Card key={idx} className="p-6">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-semibold">{phase.title}</h3>
                          <p className="text-muted-foreground">{phase.period}</p>
                        </div>
                        <Badge variant="secondary" className="rounded-full">
                          {phaseProgress}%
                        </Badge>
                      </div>

                      <Progress value={phaseProgress} className="h-2 mb-6" />

                      <div className="grid grid-cols-2 gap-4">
                        {tasks.length ? (
                          tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                              <Checkbox
                                checked={isDoneStatus(statusById[String(task.id)] ?? task.status)}
                                onCheckedChange={(v) => toggleTask(String(task.id), Boolean(v))}
                              />
                              <span
                                className={
                                  isDoneStatus(statusById[String(task.id)] ?? task.status)
                                    ? "line-through text-muted-foreground"
                                    : ""
                                }
                              >
                                {task.title || "—"}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 text-sm text-muted-foreground">
                            Aucune tâche dans cette phase pour l&apos;instant.
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}

                <Card className="p-6 bg-indigo-50 border-indigo-100">
                  <div className="flex items-start gap-4">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                      <Target className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-indigo-900 mb-2">Prochaine étape recommandée</h3>
                      <p className="text-indigo-700 mb-4">
                        Continue l&apos;exécution : synchronise ton plan puis avance phase par phase.
                      </p>
                      <Button className="bg-indigo-600 hover:bg-indigo-700">
                        Commencer
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="pyramid" className="space-y-6">
                <Card className="p-6">
                  <h3 className="text-xl font-semibold mb-2">Pyramide d&apos;offres sélectionnée</h3>
                  <p className="text-muted-foreground mb-6">
                    Voici la structure recommandée pour maximiser la conversion à chaque niveau.
                  </p>

                  <div className="grid grid-cols-3 gap-6">
                    <Card className="p-4 bg-green-50 border-green-100">
                      <h4 className="font-semibold text-green-900 mb-2">Lead Magnet</h4>
                      <div className="space-y-2 text-sm">
                        <div className="font-medium">{toStr(lead?.title) || "—"}</div>
                        <div className="text-green-700">{toStr(lead?.format) || ""}</div>
                        <div className="text-green-600">{toStr(lead?.composition) || ""}</div>
                      </div>
                    </Card>

                    <Card className="p-4 bg-blue-50 border-blue-100">
                      <h4 className="font-semibold text-blue-900 mb-2">Low Ticket</h4>
                      <div className="space-y-2 text-sm">
                        <div className="font-medium">{toStr(mid?.title) || "—"}</div>
                        <div className="text-blue-700">{toStr(mid?.format) || ""}</div>
                        <div className="text-blue-600">{toStr(mid?.composition) || ""}</div>
                      </div>
                    </Card>

                    <Card className="p-4 bg-purple-50 border-purple-100">
                      <h4 className="font-semibold text-purple-900 mb-2">High Ticket</h4>
                      <div className="space-y-2 text-sm">
                        <div className="font-medium">{toStr(high?.title) || "—"}</div>
                        <div className="text-purple-700">{toStr(high?.format) || ""}</div>
                        <div className="text-purple-600">{toStr(high?.composition) || ""}</div>
                      </div>
                    </Card>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="persona" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                      <Users className="h-5 w-5 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-semibold">Persona cible</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-2">Profil</h4>
                      <p className="text-muted-foreground">{personaTitle}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-3">Points de douleur</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {personaPains.length ? (
                            personaPains.map((p, i) => <li key={i}>• {p}</li>)
                          ) : (
                            <li>—</li>
                          )}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-3">Désirs / objectifs</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {personaGoals.length ? personaGoals.map((g, i) => <li key={i}>• {g}</li>) : <li>—</li>}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-3">Canaux de communication</h4>
                      <div className="flex flex-wrap gap-2">
                        {personaChannels.length ? (
                          personaChannels.map((c, i) => (
                            <Badge key={i} variant="secondary" className="rounded-full">
                              {c}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="rounded-full">
                            —
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
