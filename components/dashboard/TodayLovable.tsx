"use client";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Target,
  Play,
  BarChart3,
} from "lucide-react";

const TodayLovable = () => {
  const nextTask = {
    title: "Rédiger le post LinkedIn du jour",
    type: "Post",
    platform: "LinkedIn",
    dueTime: "09:00",
    priority: "high",
  };

  const stats = [
    { label: "Contenus publiés", value: "24", trend: "+12%", icon: FileText },
    { label: "Tâches complétées", value: "67%", trend: "16/24", icon: CheckCircle2 },
    { label: "Engagement", value: "2.4K", trend: "+18%", icon: TrendingUp },
    { label: "Prochaine échéance", value: "2j", trend: "Lead magnet", icon: Calendar },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Aujourd'hui</h1>
            </div>
            <Link href="/analytics">
              <Button variant="outline" size="sm">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics détaillés
              </Button>
            </Link>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Welcome Card with Next Action */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-background/20 backdrop-blur-sm flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-primary-foreground/80 text-sm">Ta prochaine action</p>
                      <h2 className="text-2xl font-bold text-primary-foreground">{nextTask.title}</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <Badge className="bg-background/20 text-primary-foreground border-none">{nextTask.type}</Badge>
                    <Badge className="bg-background/20 text-primary-foreground border-none">{nextTask.platform}</Badge>
                    <span className="text-primary-foreground/80 text-sm">Planifié pour {nextTask.dueTime}</span>
                  </div>

                  <div className="flex gap-3">
                    <Link href="/create">
                      <Button variant="secondary" size="lg">
                        <Play className="w-4 h-4 mr-2" />
                        Créer en 1 clic
                      </Button>
                    </Link>
                    <Link href="/strategy">
                      <Button variant="ghost" className="text-primary-foreground hover:bg-background/10">
                        Voir la stratégie
                      </Button>
                    </Link>
                  </div>
                </div>
                <Brain className="w-20 h-20 text-primary-foreground/30 hidden lg:block" />
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <Card key={index} className="p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-muted">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stat.trend}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </Card>
              ))}
            </div>

            {/* Progress & Actions */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Weekly Progress */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Progression de la semaine</h3>
                  <Badge variant="outline">Semaine 50</Badge>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Plan stratégique</span>
                      <span className="text-sm font-medium">75%</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Contenus planifiés</span>
                      <span className="text-sm font-medium">5/7</span>
                    </div>
                    <Progress value={71} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Objectif engagement</span>
                      <span className="text-sm font-medium">2.4K/3K</span>
                    </div>
                    <Progress value={80} className="h-2" />
                  </div>
                </div>

                <Link href="/strategy" className="block mt-6">
                  <Button variant="outline" className="w-full">
                    Voir ma stratégie complète
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </Card>

              {/* Quick Actions */}
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-6">Actions rapides</h3>

                <div className="space-y-3">
                  <Link href="/create" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Créer du contenu</p>
                          <p className="text-sm text-muted-foreground">Posts, emails, articles, vidéos...</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>

                  <Link href="/contents" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-secondary flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Voir mes contenus</p>
                          <p className="text-sm text-muted-foreground">Liste & calendrier éditorial</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>

                  <Link href="/strategy" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                          <Target className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Ma stratégie</p>
                          <p className="text-sm text-muted-foreground">Plan d'action & checklist</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                </div>
              </Card>
            </div>

            {/* Upcoming Tasks */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">À venir cette semaine</h3>
                <Link href="/contents">
                  <Button variant="ghost" size="sm">
                    Tout voir
                  </Button>
                </Link>
              </div>

              <div className="space-y-3">
                {[
                  { title: "Post LinkedIn : Stratégie 2025", type: "Post", day: "Aujourd'hui", time: "09:00", status: "À faire" },
                  { title: "Newsletter hebdomadaire", type: "Email", day: "Demain", time: "14:00", status: "Planifié" },
                  { title: "Article blog : Guide IA", type: "Article", day: "Mercredi", time: "10:00", status: "Brouillon" },
                  { title: "Finaliser lead magnet PDF", type: "Tâche", day: "Vendredi", time: "-", status: "En cours" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-shrink-0">
                      <Badge
                        variant={item.status === "À faire" ? "default" : item.status === "Planifié" ? "secondary" : "outline"}
                      >
                        {item.type}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.day} {item.time !== "-" && `• ${item.time}`}</p>
                    </div>
                    <CheckCircle2
                      className={`w-5 h-5 flex-shrink-0 ${item.status === "En cours" ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default TodayLovable;
