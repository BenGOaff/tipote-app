"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Share2,
  Mail,
  FileText,
  Video,
  Gift,
  Layers,
  Sparkles,
  MessageSquare,
  Star,
  Lightbulb,
  Megaphone,
  Camera,
  MousePointerClick,
} from "lucide-react";
import Link from "next/link";

const contentTypes = [
  {
    id: "social",
    title: "Réseaux sociaux",
    description: "Posts LinkedIn, Instagram, Twitter...",
    icon: Share2,
    href: "/create/social",
    color: "bg-blue-500",
  },
  {
    id: "email",
    title: "Email",
    description: "Newsletters, séquences, campaigns...",
    icon: Mail,
    href: "/create/email",
    color: "bg-amber-500",
  },
  {
    id: "blog",
    title: "Blog",
    description: "Articles, guides, tutoriels...",
    icon: FileText,
    href: "/create/blog",
    color: "bg-emerald-500",
  },
  {
    id: "video",
    title: "Scripts vidéo",
    description: "YouTube, Reels, TikTok...",
    icon: Video,
    href: "/create/video",
    color: "bg-red-500",
  },
  {
    id: "offer",
    title: "Offres",
    description: "Pages de vente, descriptions...",
    icon: Gift,
    href: "/create/offer",
    color: "bg-purple-500",
  },
  {
    id: "funnel",
    title: "Funnels",
    description: "Tunnels de vente complets...",
    icon: Layers,
    href: "/create/funnel",
    color: "bg-indigo-500",
  },
];

const quickTemplates = [
  {
    id: "engagement",
    title: "Post Engagement",
    description: "Question pour engager l'audience",
    icon: MessageSquare,
  },
  {
    id: "testimonial",
    title: "Témoignage Client",
    description: "Mise en avant d'un succès client",
    icon: Star,
  },
  {
    id: "expert",
    title: "Conseil Expert",
    description: "Partage d'expertise et de valeur",
    icon: Lightbulb,
  },
  {
    id: "announcement",
    title: "Annonce Produit",
    description: "Lancement ou promotion d'offre",
    icon: Megaphone,
  },
  {
    id: "behind",
    title: "Behind The Scenes",
    description: "Coulisses du business",
    icon: Camera,
  },
  {
    id: "cta",
    title: "Call To Action",
    description: "Invitation à l'action claire",
    icon: MousePointerClick,
  },
];

export default function CreatePage() {
  return (
    <DashboardLayout title="Créer" showAnalyticsLink={false}>
      <div className="space-y-8">
        {/* Hero Banner */}
        <Card className="p-8 gradient-hero border-border/50">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold text-primary-foreground mb-2">
                Quel type de contenu souhaitez-vous créer ?
              </h2>
              <p className="text-primary-foreground/80">
                L'IA utilisera vos paramètres d'onboarding pour générer du contenu aligné avec votre stratégie
              </p>
            </div>
            <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
              <Sparkles className="w-4 h-4 mr-1" />
              Propulsé par IA
            </Badge>
          </div>
        </Card>

        {/* Content Types Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contentTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Link key={type.id} href={type.href}>
                <Card className="p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group h-full">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${type.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold group-hover:text-primary transition-colors">
                        {type.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Quick Templates */}
        <div>
          <h3 className="text-lg font-display font-bold mb-4">Templates rapides</h3>
          <p className="text-muted-foreground mb-6">
            Génération en 1 clic avec paramètres pré-définis
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <Card
                  key={template.id}
                  className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{template.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
