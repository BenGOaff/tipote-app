"use client";

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
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

const Today = () => {
  const nextTask = {
    title: "Créer ton script vidéo",
    description: "Script TikTok / Reels en 60s avec hook + CTA",
    platform: "Instagram",
    dueTime: "09:00",
    priority: "high",
  };

  const stats = [
    { label: "Contenus publiés", value: "24", trend: "+12%", icon: FileText },
    { label: "Tâches complétées", value: "67%", trend: "16/24", icon: CheckCircle2 },
    { label: "Engagement", value: "2.4K", trend: "+18%", icon: TrendingUp },
    { label: "Prochaine échéance", value: "2j", trend: "Lead magnet", icon: Calendar },
  ];

  const quickActions = [
    { title: "Créer du contenu", description: "Post, email, script…", icon: Sparkles, link: "/create", color: "bg-primary" },
    { title: "Voir le calendrier", description: "Planning de publication", icon: Calendar, link: "/contents", color: "bg-success" },
    { title: "Stratégie", description: "Business plan & objectifs", icon: Target, link: "/strategy", color: "bg-warning" },
  ];

  const weekProgress = {
    completed: 4,
    total: 7,
    percentage: 57,
  };

  const upcomingContent = [
    { title: "Post carousel : 5 erreurs", platform: "Instagram", time: "14:00", status: "Prêt" },
    { title: "Email : relance offre", platform: "Email", time: "16:30", status: "En cours" },
    { title: "Script vidéo : objection", platform: "TikTok", time: "18:00", status: "À faire" },
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
                <TrendingUp className="w-4 h-4 mr-2" />
                Analytics
              </Button>
            </Link>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Welcome Card with Next Action */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-display font-bold">Ta prochaine action</h2>
                    <Badge variant="secondary" className="ml-2">
                      {nextTask.dueTime}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">{nextTask.title}</h3>
                    <p className="text-muted-foreground max-w-md">{nextTask.description}</p>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{nextTask.platform}</Badge>
                      <Badge
                        className={`${
                          nextTask.priority === "high"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-primary/10 text-primary border-primary/20"
                        }`}
                      >
                        Priorité haute
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button className="shadow-glow">
                      <Play className="w-4 h-4 mr-2" />
                      Commencer maintenant
                    </Button>
                    <Button variant="outline">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Planifier plus tard
                    </Button>
                  </div>
                </div>

                <div className="hidden md:flex flex-col items-end space-y-2">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground text-right">15 min estimées</p>
                </div>
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Card key={index} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.trend}</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Week Progress and Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Week Progress */}
              <Card className="p-6 lg:col-span-1">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                      Progression semaine
                    </h3>
                    <Badge variant="secondary">
                      {weekProgress.completed}/{weekProgress.total}
                    </Badge>
                  </div>

                  <Progress value={weekProgress.percentage} className="h-2" />

                  <p className="text-sm text-muted-foreground">
                    Tu as complété {weekProgress.percentage}% de tes objectifs cette semaine.
                  </p>

                  <Button variant="outline" className="w-full">
                    <Target className="w-4 h-4 mr-2" />
                    Voir tous les objectifs
                  </Button>
                </div>
              </Card>

              {/* Quick Actions */}
              <Card className="p-6 lg:col-span-2">
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Actions rapides
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {quickActions.map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <Link key={index} href={action.link} className="group">
                          <Card className="p-4 hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer border-border/50">
                            <div className="space-y-3">
                              <div
                                className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform`}
                              >
                                <Icon className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h4 className="font-semibold">{action.title}</h4>
                                <p className="text-sm text-muted-foreground">{action.description}</p>
                              </div>
                            </div>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>

            {/* Upcoming Content */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Contenu à venir
                  </h3>
                  <Link href="/contents">
                    <Button variant="outline" size="sm">
                      Voir tout
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>

                <div className="space-y-3">
                  {upcomingContent.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.platform} • {item.time}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            item.status === "Prêt" ? "default" : item.status === "En cours" ? "secondary" : "outline"
                          }
                        >
                          {item.status}
                        </Badge>
                        <CheckCircle2
                          className={`w-5 h-5 flex-shrink-0 ${
                            item.status === "En cours" ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Button variant="outline" className="w-full">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Demander un ajustement à l'IA
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Today;
