import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ArrowRight } from "lucide-react";
import { OnboardingData } from "./OnboardingForm";

interface StepProfileProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const countries = ["France", "Belgique", "Suisse", "Canada", "Autre"];

const ageRanges = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55+",
];

const genders = [
  { value: "feminin", label: "Féminin" },
  { value: "masculin", label: "Masculin" },
  { value: "non_genre", label: "Non genré" },
  { value: "prefere_ne_pas_repondre", label: "Je préfère ne pas répondre" },
];

export function StepProfile({ data, updateData, onNext }: StepProfileProps) {
  const isValid = data.firstName && data.ageRange && data.gender && data.country;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-bold mb-2">
          Commençons par faire connaissance
        </h2>
        <p className="text-muted-foreground">
          Ces informations nous aideront à personnaliser ton expérience
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input
            id="firstName"
            placeholder="Ton prénom"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
            className="h-12"
          />
        </div>

        <div className="space-y-2">
          <Label>Tranche d'âge *</Label>
          <RadioGroup
            value={data.ageRange}
            onValueChange={(value) => updateData({ ageRange: value })}
            className="grid grid-cols-2 gap-3"
          >
            {ageRanges.map((range) => (
              <div key={range} className="flex items-center space-x-2">
                <RadioGroupItem value={range} id={range} className="peer sr-only" />
                <Label
                  htmlFor={range}
                  className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-background p-3 text-center font-medium transition-all hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  {range}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Genre *</Label>
          <Select value={data.gender} onValueChange={(value) => updateData({ gender: value })}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Sélectionne ton genre" />
            </SelectTrigger>
            <SelectContent>
              {genders.map((gender) => (
                <SelectItem key={gender.value} value={gender.value}>
                  {gender.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Pays *</Label>
          <Select value={data.country} onValueChange={(value) => updateData({ country: value })}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Sélectionne ton pays" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onNext}
          disabled={!isValid}
          className="w-full h-12 gradient-primary text-white font-semibold"
        >
          Continuer
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </Card>
    </div>
  );
}
