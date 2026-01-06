import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle, Loader2, Target } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onBack: () => void;
  onComplete: () => void;
  isSubmitting: boolean;
}

export const StepGoals = ({ data, updateData, onBack, onComplete, isSubmitting }: StepGoalsProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-display font-bold mb-2">Dernières questions</h1>
        <p className="text-muted-foreground">On finalise votre profil et on génère votre plan stratégique</p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="innerDialogue">Dialogue intérieur (ce que vous vous dites souvent)</Label>
          <Textarea
            id="innerDialogue"
            value={data.innerDialogue}
            onChange={(e) => updateData({ innerDialogue: e.target.value })}
            rows={3}
            placeholder="Ex : Je ne suis pas légitime..., etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ifCertainSuccess">Si vous étiez certain(e) de réussir, vous feriez quoi ?</Label>
          <Textarea
            id="ifCertainSuccess"
            value={data.ifCertainSuccess}
            onChange={(e) => updateData({ ifCertainSuccess: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="biggestFears">Plus grandes peurs</Label>
          <Textarea
            id="biggestFears"
            value={data.biggestFears}
            onChange={(e) => updateData({ biggestFears: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="biggestChallenges">Plus grands challenges</Label>
          <Textarea
            id="biggestChallenges"
            value={data.biggestChallenges}
            onChange={(e) => updateData({ biggestChallenges: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="workingStrategy">Stratégie actuelle (ce que vous faites aujourd’hui)</Label>
          <Textarea
            id="workingStrategy"
            value={data.workingStrategy}
            onChange={(e) => updateData({ workingStrategy: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recentClient">Résultat client récent (preuve)</Label>
          <Textarea
            id="recentClient"
            value={data.recentClient}
            onChange={(e) => updateData({ recentClient: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="biggestBlocker">Blocage principal</Label>
          <Input
            id="biggestBlocker"
            value={data.biggestBlocker}
            onChange={(e) => updateData({ biggestBlocker: e.target.value })}
            placeholder="Ex : manque de temps, dispersion, offre floue..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalContext">Contexte additionnel (optionnel)</Label>
          <Textarea
            id="additionalContext"
            value={data.additionalContext}
            onChange={(e) => updateData({ additionalContext: e.target.value })}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>

          <Button onClick={onComplete} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Terminer
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};
