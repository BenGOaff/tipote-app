"use client";

import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
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

  const weekProgress = {
    percentage: 75,
    planned: { value: "5/7" },
    engagement: { value: "2.4K/3K" },
  };

  return (
    <DashboardLayout title="Aujourd'hui">
      <div className="space-y-6">
        {/* Hero Card - Prochaine action */}
        <Card className="p-8 gradient-hero border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-primary-foreground/80">Ta prochaine action</p>
                  <h2 className="text-2xl font-display font-bold text-primary-foreground">
                    {nextTask.title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-6">
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                >
                  {nextTask.type}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                >
                  {nextTask.platform}
                </Badge>
                <span className="text-primary-foreground/80 text-sm">
                  Planifié pour {nextTask.dueTime}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <Link href="/create">
                  <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                    <Play className="w-4 h-4 mr-2" />
                    Créer en 1 clic
                  </Button>
                </Link>

                <Link href="/strategy">
                  <Button
                    variant="ghost"
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Voir la stratégie
                  </Button>
                </Link>
              </div>
            </div>

            <div className="hidden lg:block">
              <Brain className="w-20 h-20 text-primary-foreground/20" />
            </div>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {stat.trend}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Progress + Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progression de la semaine */}
          <Card className="p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-display font-bold">Progression de la semaine</h3>
              <Badge variant="secondary">Semaine 50</Badge>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Plan stratégique</span>
                  <span className="text-sm text-muted-foreground">
                    {weekProgress.percentage}%
                  </span>
                </div>
                <Progress value={weekProgress.percentage} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Contenus planifiés</span>
                  <span className="text-sm text-muted-foreground">
                    {weekProgress.planned.value}
                  </span>
                </div>
                <Progress value={71} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Objectif engagement</span>
                  <span className="text-sm text-muted-foreground">
                    {weekProgress.engagement.value}
                  </span>
                </div>
                <Progress value={80} className="h-2" />
              </div>
            </div>
          </Card>

          {/* Actions rapides */}
          <Card className="p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-display font-bold">Actions rapides</h3>
            </div>

            <div className="space-y-4">
              <Link href="/create" className="block">
                <div className="p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Créer du contenu</h4>
                      <p className="text-sm text-muted-foreground">
                        Posts, emails, articles, vidéos...
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>

              <Link href="/contents" className="block">
                <div className="p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Voir mes contenus</h4>
                      <p className="text-sm text-muted-foreground">
                        Liste & calendrier éditorial
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>

              <Link href="/strategy" className="block">
                <div className="p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Stratégie</h4>
                      <p className="text-sm text-muted-foreground">
                        Business plan & objectifs
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TodayLovable;
