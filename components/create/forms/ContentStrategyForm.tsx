"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  CalendarDays,
  Sparkles,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";

type DayPlan = {
  day: number;
  date?: string;
  theme: string;
  contentType: string;
  platform: string;
  hook: string;
  cta: string;
};

type StrategyResult = {
  id?: string;
  title: string;
  days: DayPlan[];
};

const DURATION_OPTIONS = [
  { value: "7", label: "7 jours" },
  { value: "14", label: "14 jours" },
  { value: "30", label: "30 jours" },
];

const PLATFORM_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "email", label: "Email" },
];

const GOAL_OPTIONS = [
  { value: "visibility", label: "Visibilité & notoriété" },
  { value: "leads", label: "Génération de leads" },
  { value: "sales", label: "Ventes & conversions" },
  { value: "authority", label: "Autorité & expertise" },
  { value: "engagement", label: "Engagement communauté" },
];

interface ContentStrategyFormProps {
  onClose: () => void;
}

export function ContentStrategyForm({ onClose }: ContentStrategyFormProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [duration, setDuration] = useState("14");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [goals, setGoals] = useState<string[]>(["visibility"]);
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const toggleGoal = (g: string) => {
    setGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  };

  const handleGenerate = async () => {
    if (platforms.length === 0) {
      toast({ title: "Sélectionne au moins une plateforme", variant: "destructive" });
      return;
    }
    if (goals.length === 0) {
      toast({ title: "Sélectionne au moins un objectif", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/content/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration: Number(duration),
          platforms,
          goals,
          context: context.trim() || undefined,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Erreur serveur (${res.status}). Réessaye.`);
      }
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erreur lors de la génération");
      }

      setStrategy({ ...json.strategy, id: json.contentId || undefined });
      toast({ title: "Stratégie générée et sauvegardée !" });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de générer la stratégie",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateContent = (day: DayPlan) => {
    const type = day.contentType === "email" ? "email" : "post";
    const prompt = encodeURIComponent(
      `[Stratégie J${day.day}] ${day.theme}\nHook: ${day.hook}\nCTA: ${day.cta}`,
    );
    router.push(`/create/${type}?prompt=${prompt}&channel=${day.platform}`);
  };

  // Strategy config form
  if (!strategy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Stratégie de contenu
            </h2>
            <p className="text-sm text-muted-foreground">
              Planifie ton contenu sur plusieurs jours avec l&apos;IA
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <Label>Durée du plan</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plateformes</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <Badge
                  key={p.value}
                  variant={platforms.includes(p.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => togglePlatform(p.value)}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Objectifs</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((g) => (
                <Badge
                  key={g.value}
                  variant={goals.includes(g.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleGoal(g.value)}
                >
                  {g.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contexte supplémentaire (optionnel)</Label>
            <Textarea
              placeholder="Lancement d'offre prévu, événement à promouvoir, thématique spécifique..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Générer ma stratégie
              </>
            )}
          </Button>
        </Card>
      </div>
    );
  }

  // Strategy results view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStrategy(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{strategy.title}</h2>
            <p className="text-sm text-muted-foreground">
              {strategy.days.length} jours de contenu planifiés
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {strategy.id && (
            <Link href={`/contents/${strategy.id}`}>
              <Button variant="outline" size="sm">
                <FolderOpen className="w-4 h-4 mr-1" />
                Voir dans mes contenus
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {strategy.days.map((day) => (
          <Card key={day.day} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">J{day.day}</span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{day.theme}</p>
                  <Badge variant="secondary" className="text-xs">{day.platform}</Badge>
                  <Badge variant="outline" className="text-xs">{day.contentType}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{day.hook}</p>
                <p className="text-xs text-muted-foreground">CTA: {day.cta}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => handleCreateContent(day)}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Créer
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
