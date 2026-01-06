import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Briefcase, ArrowRight, ArrowLeft } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepBusinessProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const niches = [
  { value: "coach", label: "Coach" },
  { value: "consultant", label: "Consultant" },
  { value: "freelance", label: "Freelance" },
  { value: "agence", label: "Agence" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "autre", label: "Autre" },
];

const maturities = [
  "Je démarre",
  "J'ai déjà des clients",
  "J'ai un business stable",
  "Je veux scaler",
];

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const isValid = data.niche && data.businessMaturity;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <Briefcase className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-display font-bold mb-2">Parlons de votre business</h1>
        <p className="text-muted-foreground">
          Aidez-nous à comprendre votre activité pour mieux vous accompagner
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-3">
          <Label>Niche principale *</Label>
          <RadioGroup
            value={data.niche}
            onValueChange={(value) => updateData({ niche: value })}
            className="grid grid-cols-2 gap-2"
          >
            {niches.map((niche) => (
              <div key={niche.value} className="flex items-center">
                <RadioGroupItem value={niche.value} id={niche.value} className="peer sr-only" />
                <Label
                  htmlFor={niche.value}
                  className="flex-1 cursor-pointer rounded-lg border border-border p-3 text-center peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted/50 transition-colors"
                >
                  {niche.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {data.niche === "autre" && (
            <div className="space-y-2">
              <Label htmlFor="nicheOther">Précisez</Label>
              <Input
                id="nicheOther"
                placeholder="Votre niche"
                value={data.nicheOther}
                onChange={(e) => updateData({ nicheOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Niveau de maturité *</Label>
          <Select value={data.businessMaturity} onValueChange={(value) => updateData({ businessMaturity: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre niveau" />
            </SelectTrigger>
            <SelectContent>
              {maturities.map((maturity) => (
                <SelectItem key={maturity} value={maturity}>
                  {maturity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mission">Mission / persona (en 2-3 phrases)</Label>
          <Textarea
            id="mission"
            placeholder="À qui aidez-vous et comment ?"
            value={data.mission}
            onChange={(e) => updateData({ mission: e.target.value })}
            rows={4}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button onClick={onNext} disabled={!isValid}>
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
};
