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
  TrendingUp,
  Users,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Layers,
  Clock,
  Plus,
} from "lucide-react";

type AnyRecord = Record<string, any>;

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

type Persona = {
  title: string;
  pains: string[];
  desires: string[];
  channels: string[];
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
  persona: Persona;
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

function cleanRevenueGoal(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  // évite l'affichage moche type ["devenir riche"]
  if (s.startsWith('["') && s.endsWith('"]')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length) return String(arr[0]);
    } catch {
      // ignore
    }
  }
  return s;
}

function isDoneStatus(v: unknown) {
  const s = toStr(v).toLowerCase();
  return s === "done" || s === "completed" || s === "terminé" || s === "termine";
}

function pickSelectedPyramid(offerPyramids: AnyRecord[], initialSelectedIndex: number, initialSelectedPyramid?: AnyRecord) {
  if (initialSelectedPyramid && typeof initialSelectedPyramid === "object") return initialSelectedPyramid;
  if (Array.isArray(offerPyramids) && offerPyramids[initialSelectedIndex]) return offerPyramids[initialSelectedIndex];
  if (Array.isArray(offerPyramids) && offerPyramids[0]) return offerPyramids[0];
  return null;
}

function offerTitle(o: AnyRecord | null, fallback: string) {
  const t = (o && (o.title || o.name || o.nom)) ? toStr(o.title ?? o.name ?? o.nom) : "";
  return t || fallback;
}
function offerDesc(o: AnyRecord | null) {
  const s = o ? toStr(o.composition || o.purpose || o.description || o.insight) : "";
  return s || "—";
}
function offerPrice(o: AnyRecord | null) {
  const p = o ? (typeof o.price === "number" ? o.price : typeof o.prix === "number" ? o.prix : null) : null;
  if (p === null || typeof p !== "number") return "—";
  return `${p.toLocaleString("fr-FR")}€`;
}

export default function StrategyLovable(props: StrategyLovableProps) {
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
            <Button variant="outline" size="sm">
              Personnaliser
            </Button>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Hero Section */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-4xl font-display font-bold text-primary-foreground mb-2">
                    Votre Vision Stratégique
                  </h2>
                  <p className="text-primary-foreground/80 text-lg mb-8">
                    Plan personnalisé généré par l'IA pour atteindre vos objectifs business
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                      <p className="text-sm text-primary-foreground/70 mb-1">Objectif Revenue</p>
                      <p className="text-2xl font-bold text-primary-foreground">{cleanRevenueGoal(props.revenueGoal)}</p>
                    </div>
                    <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                      <p className="text-sm text-primary-foreground/70 mb-1">Horizon</p>
                      <p className="text-2xl font-bold text-primary-foreground">{props.horizon}</p>
                    </div>
                    <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                      <p className="text-sm text-primary-foreground/70 mb-1">Progression</p>
                      <p className="text-2xl font-bold text-primary-foreground">{props.progressionPercent}%</p>
                    </div>
                  </div>
                </div>
                <Target className="w-20 h-20 text-primary-foreground/30 hidden lg:block" />
              </div>
            </Card>

            {/* Tabs for different views */}
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="plan">Plan d'action</TabsTrigger>
                <TabsTrigger value="pyramid">Pyramide d'offres</TabsTrigger>
                <TabsTrigger value="persona">Persona cible</TabsTrigger>
              </TabsList>

              {/* Action Plan Tab */}
              <TabsContent value="plan" className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Tâches complétées</h3>
                    </div>
                    <p className="text-3xl font-bold mb-2">
                      {props.totalDone}/{props.totalAll || "—"}
                    </p>
                    <Progress
                      value={props.totalAll ? Math.round((props.totalDone / Math.max(1, props.totalAll)) * 100) : 0}
                      className="h-2"
                    />
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-secondary-foreground" />
                      </div>
                      <h3 className="font-semibold">Jours restants</h3>
                    </div>
                    <p className="text-3xl font-bold mb-2">{props.daysRemaining}</p>
                    <p className="text-muted-foreground">Sur 90 jours</p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-success" />
                      </div>
                      <h3 className="font-semibold">Phase actuelle</h3>
                    </div>
                    <p className="text-3xl font-bold mb-2">{props.currentPhase}</p>
                    <p className="text-muted-foreground">{props.currentPhaseLabel}</p>
                  </Card>
                </div>

                {(props.phases || []).map((phase, index) => {
                  const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
                  const done = tasks.filter((t) => isDoneStatus(t.status)).length;
                  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

                  return (
                    <Card key={index} className="p-6">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold">{phase.title}</h3>
                          <p className="text-muted-foreground">{phase.period}</p>
                        </div>
                        <Badge variant="outline">{pct}%</Badge>
                      </div>

                      <Progress value={pct} className="h-2 mb-6" />

                      <div className="grid grid-cols-2 gap-4">
                        {tasks.length ? (
                          tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                              <Checkbox checked={isDoneStatus(task.status)} />
                              <span className={isDoneStatus(task.status) ? "line-through text-muted-foreground" : ""}>
                                {task.title || "—"}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-muted-foreground">Aucune tâche dans cette phase pour l'instant.</p>
                        )}
                      </div>
                    </Card>
                  );
                })}

                <Card className="p-6 bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-3 mb-4">
                    <Target className="w-6 h-6 text-primary" />
                    <h3 className="text-lg font-bold text-primary">Prochaine étape recommandée</h3>
                  </div>
                  <p className="text-muted-foreground mb-4">
                    Continue l'exécution : synchronise ton plan puis avance phase par phase.
                  </p>
                  <Button className="bg-primary hover:bg-primary/90">
                    Commencer
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Card>
              </TabsContent>

              {/* Offer Pyramid Tab */}
              <TabsContent value="pyramid" className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                      <Layers className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold">Pyramide d'Offres</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="p-5 rounded-lg border-2 border-success bg-success/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-success">High Ticket</p>
                          <p className="text-3xl font-bold mt-1">{offerPrice(high)}</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      </div>
                      <p className="text-muted-foreground mt-2">{offerTitle(high, "—")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{offerDesc(high)}</p>
                    </div>

                    <div className="p-5 rounded-lg border-2 border-primary bg-primary/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-primary">Middle Ticket</p>
                          <p className="text-3xl font-bold mt-1">{offerPrice(mid)}</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-muted-foreground mt-2">{offerTitle(mid, "—")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{offerDesc(mid)}</p>
                    </div>

                    <div className="p-5 rounded-lg border-2 border-secondary bg-secondary/5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-secondary-foreground">Lead Magnet</p>
                          <p className="text-3xl font-bold mt-1">{offerPrice(lead)}</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-secondary-foreground" />
                      </div>
                      <p className="text-muted-foreground mt-2">{offerTitle(lead, "—")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{offerDesc(lead)}</p>
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
                    <h3 className="text-xl font-bold">Persona Cible</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Profil Principal</h4>
                      <p className="text-lg font-bold mb-4">{personaTitle}</p>

                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Problèmes Principaux</h4>
                      <div className="space-y-2">
                        {(personaPains.length ? personaPains : ["—"]).map((pain, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span>{pain}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Objectifs</h4>
                      <div className="space-y-2 mb-6">
                        {(personaGoals.length ? personaGoals : ["—"]).map((goal, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success" />
                            <span>{goal}</span>
                          </div>
                        ))}
                      </div>

                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Canaux préférés</h4>
                      <div className="flex flex-wrap gap-2">
                        {(personaChannels.length ? personaChannels : ["—"]).map((c, i) => (
                          <Badge key={i} variant="secondary">
                            {c}
                          </Badge>
                        ))}
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
