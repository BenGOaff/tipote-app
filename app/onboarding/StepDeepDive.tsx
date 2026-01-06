import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepDeepDiveProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const mainGoals = [
  { value: "clients", label: "Trouver plus de clients" },
  { value: "offre", label: "Clarifier / améliorer mon offre" },
  { value: "contenu", label: "Produire du contenu plus efficacement" },
  { value: "systeme", label: "Structurer mon système (process, funnel)" },
  { value: "croissance", label: "Scaler (CA, équipe, acquisition)" },
  { value: "autre", label: "Autre" },
];

const contentTypes = [
  { value: "posts", label: "Posts réseaux sociaux" },
  { value: "emails", label: "Emails / newsletter" },
  { value: "scripts", label: "Scripts vidéo" },
  { value: "articles", label: "Articles / blog" },
  { value: "ads", label: "Publicités" },
];

export const StepDeepDive = ({ data, updateData, onNext, onBack }: StepDeepDiveProps) => {
  const toggleArrayValue = (key: "mainGoals" | "preferredContentTypes", value: string) => {
    const current = data[key] ?? [];
    if (current.includes(value)) {
      updateData({ [key]: current.filter((v) => v !== value) } as Partial<OnboardingData>);
    } else {
      updateData({ [key]: [...current, value] } as Partial<OnboardingData>);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-display font-bold mb-2">Affinons votre profil</h1>
        <p className="text-muted-foreground">
          Ces réponses alimentent directement votre profil Supabase (business_profiles)
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="energySource">Source d’énergie (ce qui vous motive)</Label>
          <Textarea
            id="energySource"
            placeholder="Ex : aider les gens à..., liberté, impact, etc."
            value={data.energySource}
            onChange={(e) => updateData({ energySource: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="uniqueValue">Valeur unique (ce qui vous différencie)</Label>
          <Textarea
            id="uniqueValue"
            placeholder="Ex : méthode, expérience, angle, promesse..."
            value={data.uniqueValue}
            onChange={(e) => updateData({ uniqueValue: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="untappedStrategy">Stratégie non exploitée (opportunité)</Label>
          <Textarea
            id="untappedStrategy"
            placeholder="Ex : canal sous-exploité, offre à packager..."
            value={data.untappedStrategy}
            onChange={(e) => updateData({ untappedStrategy: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="communication">Communication (style / messages clés)</Label>
          <Textarea
            id="communication"
            placeholder="Ex : ton, valeurs, messages que vous répétez..."
            value={data.communication}
            onChange={(e) => updateData({ communication: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="successDefinition">Définition du succès</Label>
          <Textarea
            id="successDefinition"
            placeholder="Ex : X€/mois, équilibre, impact..."
            value={data.successDefinition}
            onChange={(e) => updateData({ successDefinition: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sixMonthVision">Vision à 6 mois</Label>
          <Textarea
            id="sixMonthVision"
            placeholder="Ex : ce que vous voulez avoir accompli dans 6 mois"
            value={data.sixMonthVision}
            onChange={(e) => updateData({ sixMonthVision: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <Label>Objectifs principaux</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mainGoals.map((g) => (
              <label key={g.value} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={data.mainGoals.includes(g.value)}
                  onCheckedChange={() => toggleArrayValue("mainGoals", g.value)}
                />
                <span className="text-sm">{g.label}</span>
              </label>
            ))}
          </div>
          {data.mainGoals.includes("autre") && (
            <div className="space-y-2">
              <Label htmlFor="mainGoalsOther">Précisez</Label>
              <Input
                id="mainGoalsOther"
                placeholder="Votre objectif"
                value={data.mainGoalsOther}
                onChange={(e) => updateData({ mainGoalsOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Types de contenu préférés</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contentTypes.map((t) => (
              <label key={t.value} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={data.preferredContentTypes.includes(t.value)}
                  onCheckedChange={() => toggleArrayValue("preferredContentTypes", t.value)}
                />
                <span className="text-sm">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tonePreference">Préférence de ton</Label>
          <Input
            id="tonePreference"
            placeholder="Ex : direct, bienveillant, humoristique..."
            value={data.tonePreference}
            onChange={(e) => updateData({ tonePreference: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button onClick={onNext}>
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
};
