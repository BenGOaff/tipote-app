import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { OnboardingData } from "./OnboardingForm";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const financialGoals = [
  { value: "1000", label: "1 000€/mois" },
  { value: "3000", label: "3 000€/mois" },
  { value: "5000", label: "5 000€/mois" },
  { value: "10000", label: "10 000€/mois" },
  { value: "20000+", label: "20 000€+/mois" },
];

const psychologicalGoals = [
  { value: "liberte", label: "🏖️ Plus de liberté" },
  { value: "reconnaissance", label: "⭐ Reconnaissance & impact" },
  { value: "securite", label: "🛡️ Sécurité financière" },
  { value: "passion", label: "❤️ Vivre de ma passion" },
  { value: "famille", label: "👨‍👩‍👧‍👦 Temps avec ma famille" },
];

const contentPreferences = [
  { value: "posts", label: "Posts réseaux sociaux" },
  { value: "emails", label: "Emails" },
  { value: "articles", label: "Articles de blog" },
  { value: "videos", label: "Scripts vidéo" },
];

const tones = [
  { value: "professionnel", label: "Professionnel" },
  { value: "amical", label: "Amical" },
  { value: "direct", label: "Direct" },
  { value: "inspirant", label: "Inspirant" },
];

export function StepGoals({ data, updateData, onComplete, onBack, isSubmitting }: StepGoalsProps) {
  const isValid = data.financialGoal && data.psychologicalGoal && data.contentPreference && data.preferredTone;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-bold mb-2">
          Tes objectifs
        </h2>
        <p className="text-muted-foreground">
          Dernière étape ! Définissons où tu veux aller
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label>Objectif financier *</Label>
          <Select value={data.financialGoal} onValueChange={(value) => updateData({ financialGoal: value })}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Quel revenu mensuel vise-tu ?" />
            </SelectTrigger>
            <SelectContent>
              {financialGoals.map((goal) => (
                <SelectItem key={goal.value} value={goal.value}>
                  {goal.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Objectif personnel *</Label>
          <RadioGroup
            value={data.psychologicalGoal}
            onValueChange={(value) => updateData({ psychologicalGoal: value })}
            className="space-y-3"
          >
            {psychologicalGoals.map((goal) => (
              <div key={goal.value} className="flex items-center space-x-2">
                <RadioGroupItem value={goal.value} id={goal.value} className="peer sr-only" />
                <Label
                  htmlFor={goal.value}
                  className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-background p-4 font-medium transition-all hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  {goal.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Type de contenu préféré *</Label>
          <Select value={data.contentPreference} onValueChange={(value) => updateData({ contentPreference: value })}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Quel contenu veux-tu créer ?" />
            </SelectTrigger>
            <SelectContent>
              {contentPreferences.map((pref) => (
                <SelectItem key={pref.value} value={pref.value}>
                  {pref.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tonalité préférée *</Label>
          <Select value={data.preferredTone} onValueChange={(value) => updateData({ preferredTone: value })}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Quel ton souhaites-tu ?" />
            </SelectTrigger>
            <SelectContent>
              {tones.map((tone) => (
                <SelectItem key={tone.value} value={tone.value}>
                  {tone.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={onBack} variant="outline" className="flex-1 h-12" disabled={isSubmitting}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Retour
          </Button>

          <Button
            onClick={onComplete}
            disabled={!isValid || isSubmitting}
            className="flex-1 h-12 gradient-primary text-white font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Finalisation...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Terminer
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
