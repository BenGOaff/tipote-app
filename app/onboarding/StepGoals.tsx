import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowLeft, Check } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export const StepGoals = ({ data, updateData, onComplete, onBack, isSubmitting }: StepGoalsProps) => {
  const toggleTone = (tone: string) => {
    const current = data.preferredTones || [];
    if (current.includes(tone)) {
      updateData({ preferredTones: current.filter(t => t !== tone) });
    } else if (current.length < 3) {
      updateData({ preferredTones: [...current, tone] });
    }
  };

  const isValid =
    data.uniqueValue &&
    data.untappedStrength &&
    data.biggestChallenge &&
    data.successDefinition &&
    data.clientFeedback &&
    data.communicationStyle &&
    data.preferredTones.length > 0;

  return (
    <Card className="p-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-primary/10 rounded-full">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Ce qui te rend unique</h2>
          <p className="text-muted-foreground">Dernière étape !</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <Label className="text-sm font-medium">
            Quelle est ta valeur unique ? *
          </Label>
          <Textarea
            value={data.uniqueValue}
            onChange={(e) => updateData({ uniqueValue: e.target.value })}
            placeholder="Qu'est-ce qui te distingue des autres dans ton domaine ?"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Quel est ton talent inexploité ? *
          </Label>
          <Textarea
            value={data.untappedStrength}
            onChange={(e) => updateData({ untappedStrength: e.target.value })}
            placeholder="Quelle compétence ou expérience as-tu que tu n'utilises pas assez ?"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Ton plus gros défi actuellement ? *
          </Label>
          <Textarea
            value={data.biggestChallenge}
            onChange={(e) => updateData({ biggestChallenge: e.target.value })}
            placeholder="Qu'est-ce qui t'empêche le plus d'avancer aujourd'hui ?"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Comment définirais-tu le succès ? *
          </Label>
          <Textarea
            value={data.successDefinition}
            onChange={(e) => updateData({ successDefinition: e.target.value })}
            placeholder="À quoi ressemblerait ta vie/business idéal ?"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Que disent tes clients récents ? *
          </Label>
          <Textarea
            value={data.clientFeedback}
            onChange={(e) => updateData({ clientFeedback: e.target.value })}
            placeholder="Quels retours as-tu eu récemment (même informels) ?"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Ton style de communication naturel ? *
          </Label>
          <Textarea
            value={data.communicationStyle}
            onChange={(e) => updateData({ communicationStyle: e.target.value })}
            placeholder="Ex: Direct et authentique, drôle et léger, pédagogique..."
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">
            Quel ton préfères-tu pour tes contenus ? * (max 3)
          </Label>
          <p className="text-xs text-muted-foreground mt-1">Sélectionne jusqu'à 3 tons</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              "Motivant",
              "Inspirant",
              "Pédagogique",
              "Humoristique",
              "Direct",
              "Bienveillant",
              "Storytelling",
              "Expert"
            ].map((tone) => (
              <button
                key={tone}
                onClick={() => toggleTone(tone)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  data.preferredTones.includes(tone)
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-white/50 hover:bg-white/80"
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <Button onClick={onBack} variant="outline" className="flex-1 h-12 gap-2" disabled={isSubmitting}>
            <ArrowLeft className="h-5 w-5" />
            Retour
          </Button>
          <Button
            onClick={onComplete}
            disabled={!isValid || isSubmitting}
            className="flex-1 h-12 gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            {isSubmitting ? "Finalisation..." : "Terminer"}
            <Check className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
