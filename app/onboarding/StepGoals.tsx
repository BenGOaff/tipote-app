import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Target, ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

// ✅ CDC: objectif financier net mensuel (input libre)
const psychologicalGoals = [
  { value: "fier", label: "Se sentir fier" },
  { value: "utile", label: "Se sentir utile" },
  { value: "temps_libre", label: "Avoir du temps libre" },
  { value: "quitter_salariat", label: "Quitter le salariat" },
  { value: "retraite", label: "Améliorer la retraite" },
  { value: "aider_autres", label: "Aider les autres" },
  { value: "liberte_financiere", label: "Liberté financière" },
  { value: "autre", label: "Autre" },
];

// ✅ CDC: préférence contenu écriture / vidéo
const contentPreferences = [
  { value: "ecriture", label: "✍️ Écriture (posts, articles, emails)" },
  { value: "video", label: "🎬 Vidéo (YouTube, TikTok, Reels)" },
];

const tones = [
  { value: "professionnel", label: "Professionnel" },
  { value: "decontracte", label: "Décontracté" },
  { value: "inspirant", label: "Inspirant" },
  { value: "humoristique", label: "Humoristique" },
  { value: "educatif", label: "Éducatif" },
  { value: "provocateur", label: "Provocateur" },
];

export const StepGoals = ({ data, updateData, onComplete, onBack, isSubmitting }: StepGoalsProps) => {
  const togglePsychGoal = (goal: string) => {
    const current = data.psychologicalGoals || [];
    if (current.includes(goal)) {
      updateData({ psychologicalGoals: current.filter((g) => g !== goal) });
    } else {
      updateData({ psychologicalGoals: [...current, goal] });
    }
  };

  const isValid =
    !!data.financialGoal &&
    (data.psychologicalGoals?.length ?? 0) > 0 &&
    !!data.contentPreference &&
    !!data.preferredTone;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-display font-bold mb-2">Vos objectifs</h2>
        <p className="text-muted-foreground text-lg">
          Pour configurer votre plan d'action personnalisé
        </p>
      </div>

      <Card className="p-8 shadow-lg border-0 bg-background/80 backdrop-blur-sm space-y-6">
        <div className="space-y-2">
          <Label htmlFor="financialGoal">Objectif financier mensuel net *</Label>
          <Input
            id="financialGoal"
            placeholder="Ex: 5000"
            value={data.financialGoal}
            onChange={(e) => updateData({ financialGoal: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Montant en euros, net mensuel.</p>
        </div>

        <div className="space-y-3">
          <Label>Objectif psychologique (plusieurs choix possibles) *</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {psychologicalGoals.map((g) => {
              const checked = (data.psychologicalGoals || []).includes(g.value);
              return (
                <div key={g.value} className="flex items-center gap-3 rounded-lg border-2 border-muted bg-background p-4">
                  <Checkbox
                    id={`psy-${g.value}`}
                    checked={checked}
                    onCheckedChange={() => togglePsychGoal(g.value)}
                  />
                  <Label htmlFor={`psy-${g.value}`} className="cursor-pointer font-medium">
                    {g.label}
                  </Label>
                </div>
              );
            })}
          </div>

          {(data.psychologicalGoals || []).includes("autre") && (
            <div className="space-y-2">
              <Label htmlFor="psychOther">Précisez</Label>
              <Input
                id="psychOther"
                placeholder="Ex: voyager 3 mois par an..."
                value={data.psychologicalGoalsOther}
                onChange={(e) => updateData({ psychologicalGoalsOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Préférence contenu *</Label>
          <RadioGroup
            value={data.contentPreference}
            onValueChange={(value) => updateData({ contentPreference: value })}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {contentPreferences.map((p) => (
              <div key={p.value} className="flex items-center">
                <RadioGroupItem value={p.value} id={p.value} className="peer sr-only" />
                <Label
                  htmlFor={p.value}
                  className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-background p-4 text-center text-sm font-medium transition-all hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  {p.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Ton préféré *</Label>
          <Select value={data.preferredTone} onValueChange={(value) => updateData({ preferredTone: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Choisissez un ton" />
            </SelectTrigger>
            <SelectContent>
              {tones.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>

        <Button onClick={onComplete} disabled={!isValid || isSubmitting} size="lg">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Configuration...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Commencer avec Tipote™
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default StepGoals;
