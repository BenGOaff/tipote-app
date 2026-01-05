"use client";

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

import StrategyClient from "@/app/strategy/StrategyClient";
import SyncTasksButton from "@/app/strategy/SyncTasksButton";

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

type Persona = {
  title: string;
  pains: string[];
  desires: string[];
  channels: string[];
};

type AnyRecord = Record<string, unknown>;

type Phase = {
  title: string;
  period: string;
  tasks: TaskRow[];
};

type Props = {
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

  persona: Persona;

  offerPyramids: AnyRecord[];
  initialSelectedIndex: number;
  initialSelectedPyramid?: AnyRecord;

  planTasksCount: number;
};

function isDone(t: TaskRow) {
  return (t.status ?? "").toLowerCase() === "done";
}

function phaseProgress(tasks: TaskRow[]) {
  if (!tasks.length) return 0;
  const done = tasks.filter(isDone).length;
  return Math.round((done / tasks.length) * 100);
}

export default function StrategyLovable(props: Props) {
  const {
    revenueGoal,
    horizon,
    progressionPercent,
    totalDone,
    totalAll,
    daysRemaining,
    currentPhase,
    currentPhaseLabel,
    phases,
    persona,
    offerPyramids,
    initialSelectedIndex,
    initialSelectedPyramid,
    planTasksCount,
  } = props;

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

            {/* bouton Lovable "Personnaliser" (on garde sans casser le flow) */}
            <Button variant="outline">Personnaliser</Button>
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Strategic Overview — Lovable 1:1 */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-display font-bold text-primary-foreground mb-3">
                    Votre Vision Stratégique
                  </h2>
                  <p className="text-primary-foreground/90 text-lg max-w-2xl">
                    Plan personnalisé généré par l'IA pour atteindre vos objectifs business
                  </p>
                </div>
                <Target className="w-16 h-16 text-primary-foreground/80 hidden lg:block" />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">Objectif Revenue</p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {revenueGoal || "—"}
                  </p>
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">Horizon</p>
                  <p className="text-2xl font-bold text-primary-foreground">{horizon}</p>
                </div>
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">Progression</p>
                  <p className="text-2xl font-bold text-primary-foreground">{progressionPercent}%</p>
                </div>
              </div>
            </Card>

            {/* Tabs — Lovable 1:1 */}
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="plan">Plan d'action</TabsTrigger>
                <TabsTrigger value="pyramid">Pyramide d'offres</TabsTrigger>
                <TabsTrigger value="persona">Persona cible</TabsTrigger>
              </TabsList>

              {/* Plan d'action — Lovable 1:1 */}
              <TabsContent value="plan" className="space-y-6">
                {/* Progress Overview — Lovable 1:1 */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Tâches complétées</span>
                    </div>
                    <p className="text-3xl font-bold">
                      {totalAll ? `${totalDone}/${totalAll}` : `${totalDone}/—`}
                    </p>
                    <Progress value={totalAll ? Math.round((totalDone / totalAll) * 100) : 0} className="mt-3" />
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Jours restants</span>
                    </div>
                    <p className="text-3xl font-bold">{daysRemaining}</p>
                    <p className="text-sm text-muted-foreground mt-1">Sur 90 jours</p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">Phase actuelle</span>
                    </div>
                    <p className="text-3xl font-bold">{currentPhase}</p>
                    <p className="text-sm text-muted-foreground mt-1">{currentPhaseLabel}</p>
                  </Card>
                </div>

                {/* Boutons utiles (sans casser) */}
                <div className="flex flex-wrap gap-2">
                  {planTasksCount > 0 ? <SyncTasksButton variant="outline" /> : null}
                </div>

                {/* Phases — Lovable 1:1 (mêmes cards + checkbox list) */}
                <div className="space-y-6">
                  {phases.map((phase, phaseIndex) => {
                    const prog = phaseProgress(phase.tasks);
                    return (
                      <Card key={phaseIndex} className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold">{phase.title}</h3>
                            <p className="text-sm text-muted-foreground">{phase.period}</p>
                          </div>
                          <Badge variant={prog === 100 ? "default" : prog > 0 ? "secondary" : "outline"}>
                            {prog}%
                          </Badge>
                        </div>

                        <Progress value={prog} className="mb-4" />

                        <div className="grid md:grid-cols-2 gap-3">
                          {phase.tasks.length ? (
                            phase.tasks.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <Checkbox checked={isDone(item)} />
                                <span className={isDone(item) ? "line-through text-muted-foreground" : ""}>
                                  {item.title || "—"}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Aucune tâche dans cette phase pour l’instant.
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Next Step — Lovable 1:1 (on garde le visuel, mais texte générique minimal) */}
                <Card className="p-5 bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-4">
                    <Target className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-primary mb-1">Prochaine étape recommandée</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Continue l’exécution : synchronise ton plan puis avance phase par phase.
                      </p>
                      <Button variant="default" size="sm">
                        Commencer <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Pyramide — Lovable 1:1 wrapper visuel, contenu fonctionnel Tipote conservé */}
              <TabsContent value="pyramid" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <Layers className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Pyramide d'Offres</h3>
                  </div>

                  {/* Ici on garde TA logique (choose + edit + save supabase via API) */}
                  <StrategyClient
                    offerPyramids={offerPyramids}
                    initialSelectedIndex={initialSelectedIndex}
                    initialSelectedPyramid={initialSelectedPyramid}
                  />

                  {/* Bouton Lovable visuel (optionnel), ne casse rien */}
                  <Button variant="outline" className="w-full mt-6" disabled>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une offre
                  </Button>
                </Card>
              </TabsContent>

              {/* Persona — Lovable 1:1 mais alimenté par plan_json */}
              <TabsContent value="persona" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-secondary flex items-center justify-center">
                      <Users className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Persona Cible</h3>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Profil Principal</p>
                        <p className="font-semibold text-lg">{persona.title || "—"}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-3">Problèmes Principaux</p>
                        <ul className="space-y-2">
                          {(persona.pains?.length ? persona.pains : ["—"]).map((p, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-2 h-2 rounded-full bg-destructive mt-2 flex-shrink-0" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-3">Objectifs</p>
                        <ul className="space-y-2">
                          {(persona.desires?.length ? persona.desires : ["—"]).map((d, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-2 h-2 rounded-full bg-success mt-2 flex-shrink-0" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Canaux préférés</p>
                        <div className="flex flex-wrap gap-2">
                          {(persona.channels?.length ? persona.channels : ["—"]).map((c, idx) => (
                            <Badge key={idx} variant="outline">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full mt-6" disabled>
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
