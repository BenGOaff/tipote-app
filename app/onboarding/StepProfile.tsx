import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ArrowRight } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepProfileProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const countries = ["France", "Belgique", "Suisse", "Canada", "Autre"];

const ageRanges = [
  { value: "18-24", label: "18-24" },
  { value: "25-34", label: "25-34" },
  { value: "35-44", label: "35-44" },
  { value: "45-54", label: "45-54" },
  { value: "55+", label: "55+" },
];

const genderOptions = [
  { value: "female", label: "Elle" },
  { value: "male", label: "Il" },
  { value: "neutral", label: "Neutre" },
];

const niches = [
  { value: "Argent & business", label: "Argent & business" },
  { value: "Santé & bien-être", label: "Santé & bien-être" },
  { value: "Dev perso", label: "Dev perso" },
  { value: "Relations", label: "Relations" },
  { value: "Autre", label: "Autre" },
];

const maturities = [
  { value: "Pas encore lancé", label: "Pas encore lancé" },
  { value: "Lancé mais pas vendu", label: "Lancé mais pas vendu" },
  { value: "< 500€/mois", label: "< 500€/mois" },
  { value: "500-2000€/mois", label: "500-2000€/mois" },
  { value: "> 2000€/mois", label: "> 2000€/mois" },
];

const blockers = [
  { value: "manque de temps", label: "Manque de temps" },
  { value: "manque d’argent", label: "Manque d’argent" },
  { value: "manque de connaissance", label: "Manque de connaissance" },
  { value: "manque d’organisation", label: "Manque d’organisation" },
];

export const StepProfile = ({ data, updateData, onNext }: StepProfileProps) => {
  const isValid =
    !!data.firstName &&
    !!data.ageRange &&
    !!data.gender &&
    !!data.country &&
    !!data.niche &&
    !!data.missionStatement &&
    !!data.maturity &&
    !!data.biggestBlocker;

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Toi & ton business</h2>
            <p className="text-muted-foreground">Questions essentielles (obligatoire)</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Prénom *</Label>
            <Input value={data.firstName} onChange={(e) => updateData({ firstName: e.target.value })} placeholder="Ton prénom" />
          </div>

          <div className="space-y-2">
            <Label>Tranche d'âge *</Label>
            <Select value={data.ageRange} onValueChange={(value) => updateData({ ageRange: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne une tranche" />
              </SelectTrigger>
              <SelectContent>
                {ageRanges.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Comment veux-tu que je m'adresse à toi ? *</Label>
            <RadioGroup value={data.gender} onValueChange={(value) => updateData({ gender: value })} className="grid gap-3">
              {genderOptions.map((g) => (
                <div
                  key={g.value}
                  className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <RadioGroupItem value={g.value} id={`gender-${g.value}`} />
                  <Label htmlFor={`gender-${g.value}`} className="cursor-pointer font-normal">
                    {g.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Pays *</Label>
            <Select value={data.country} onValueChange={(value) => updateData({ country: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne ton pays" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dans quel domaine exerces-tu ? *</Label>
            <Select value={data.niche} onValueChange={(value) => updateData({ niche: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne ton domaine" />
              </SelectTrigger>
              <SelectContent>
                {niches.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Décris en une phrase : qui aides-tu à faire quoi ? *</Label>
            <Textarea
              value={data.missionStatement}
              onChange={(e) => updateData({ missionStatement: e.target.value })}
              placeholder="J'aide les plombiers à trouver plus de clients grâce à leur fiche Google My Business"
              className="min-h-[96px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Où en es-tu aujourd'hui ? *</Label>
            <RadioGroup value={data.maturity} onValueChange={(value) => updateData({ maturity: value })} className="grid gap-3">
              {maturities.map((m) => (
                <div
                  key={m.value}
                  className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <RadioGroupItem value={m.value} id={`maturity-${m.value}`} />
                  <Label htmlFor={`maturity-${m.value}`} className="cursor-pointer font-normal">
                    {m.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Ton plus gros blocage aujourd’hui *</Label>
            <Select value={data.biggestBlocker} onValueChange={(value) => updateData({ biggestBlocker: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne ton blocage" />
              </SelectTrigger>
              <SelectContent>
                {blockers.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuer
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
