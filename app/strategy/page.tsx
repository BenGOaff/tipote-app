"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Target,
  Euro,
  Calendar,
  TrendingUp,
  Settings,
  Gift,
  Rocket,
  Crown,
} from "lucide-react";

export default function StrategyPage() {
  return (
    <DashboardLayout 
      title="Ma Stratégie"
      headerActions={
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Personnaliser
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Hero Banner */}
        <Card className="p-8 gradient-hero border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-primary-foreground mb-2">
                Votre Vision Stratégique
              </h2>
              <p className="text-primary-foreground/80">
                Plan personnalisé basé sur votre profil business
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 py-1.5 px-3">
                <Euro className="w-4 h-4 mr-1" />
                5 000€/mois
              </Badge>
              <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 py-1.5 px-3">
                <Calendar className="w-4 h-4 mr-1" />
                90 jours
              </Badge>
              <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 py-1.5 px-3">
                <TrendingUp className="w-4 h-4 mr-1" />
                67%
              </Badge>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="plan" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="plan">Plan d'action</TabsTrigger>
            <TabsTrigger value="pyramid">Pyramide d'offres</TabsTrigger>
            <TabsTrigger value="persona">Persona cible</TabsTrigger>
          </TabsList>

          {/* Tab: Plan d'action */}
          <TabsContent value="plan" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Tâches complétées</p>
                <p className="text-3xl font-bold mt-1">16/24</p>
              </Card>
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Jours restants</p>
                <p className="text-3xl font-bold mt-1">23</p>
              </Card>
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Phase actuelle</p>
                <p className="text-3xl font-bold mt-1">Croissance</p>
              </Card>
            </div>

            {/* Phases */}
            <div className="space-y-4">
              {/* Phase 1 */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                      <Target className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Phase 1 : Fondations</h3>
                      <p className="text-sm text-muted-foreground">J1-30</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-success/10 text-success">
                    100% complété
                  </Badge>
                </div>
                <Progress value={100} className="h-2 mb-4" />
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox checked disabled />
                    <span className="line-through text-muted-foreground">Définir le persona cible</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked disabled />
                    <span className="line-through text-muted-foreground">Créer le lead magnet</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked disabled />
                    <span className="line-through text-muted-foreground">Configurer l'emailing</span>
                  </div>
                </div>
              </Card>

              {/* Phase 2 */}
              <Card className="p-6 border-primary/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Rocket className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Phase 2 : Croissance</h3>
                      <p className="text-sm text-muted-foreground">J31-60</p>
                    </div>
                  </div>
                  <Badge variant="secondary">67% en cours</Badge>
                </div>
                <Progress value={67} className="h-2 mb-4" />
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox checked />
                    <span className="line-through text-muted-foreground">Lancer les premiers posts LinkedIn</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked />
                    <span className="line-through text-muted-foreground">Créer la séquence email de bienvenue</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox />
                    <span>Rédiger 5 articles SEO</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox />
                    <span>Créer l'offre middle-ticket</span>
                  </div>
                </div>
              </Card>

              {/* Phase 3 */}
              <Card className="p-6 opacity-60">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Crown className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Phase 3 : Scale</h3>
                      <p className="text-sm text-muted-foreground">J61-90</p>
                    </div>
                  </div>
                  <Badge variant="secondary">À venir</Badge>
                </div>
                <Progress value={0} className="h-2" />
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Pyramide d'offres */}
          <TabsContent value="pyramid" className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              {/* High Ticket */}
              <Card className="w-full max-w-md p-6 border-2 border-primary">
                <div className="flex items-center gap-3 mb-2">
                  <Crown className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">High Ticket</h3>
                    <p className="text-sm text-muted-foreground">Accompagnement Premium</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">2 997€</p>
                <Badge className="mt-2">À créer</Badge>
              </Card>

              {/* Middle Ticket */}
              <Card className="w-full max-w-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Rocket className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">Middle Ticket</h3>
                    <p className="text-sm text-muted-foreground">Formation Complète</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">497€</p>
                <Badge variant="secondary" className="mt-2">En cours</Badge>
              </Card>

              {/* Low Ticket */}
              <Card className="w-full max-w-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">Low Ticket</h3>
                    <p className="text-sm text-muted-foreground">Mini-formation</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">47€</p>
                <Badge variant="secondary" className="bg-success/10 text-success mt-2">Live</Badge>
              </Card>

              {/* Lead Magnet */}
              <Card className="w-full p-6 bg-muted/30">
                <div className="flex items-center gap-3 mb-2">
                  <Gift className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">Lead Magnet</h3>
                    <p className="text-sm text-muted-foreground">Guide gratuit</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">Gratuit</p>
                <Badge variant="secondary" className="bg-success/10 text-success mt-2">Live</Badge>
              </Card>
            </div>

            <div className="flex justify-center">
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Modifier la pyramide
              </Button>
            </div>
          </TabsContent>

          {/* Tab: Persona */}
          <TabsContent value="persona">
            <Card className="p-8">
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-10 h-10 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">Entrepreneur digital 30-45 ans</h3>
                  <p className="text-muted-foreground mb-6">
                    Consultant ou coach qui souhaite développer sa présence en ligne et automatiser son acquisition client.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">Problèmes principaux</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Manque de temps pour créer du contenu</li>
                        <li>• Difficulté à trouver des clients réguliers</li>
                        <li>• Pas de stratégie marketing claire</li>
                        <li>• Submergé par les outils techniques</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">Objectifs</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Atteindre 5 000€/mois de CA</li>
                        <li>• Avoir un flux constant de prospects</li>
                        <li>• Automatiser la création de contenu</li>
                        <li>• Gagner en sérénité et clarté</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Button variant="outline">
                      <Settings className="w-4 h-4 mr-2" />
                      Affiner le persona
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
