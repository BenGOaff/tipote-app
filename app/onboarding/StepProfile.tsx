import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ArrowRight } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepProfileProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const countries = [
  "France",
  "Belgique",
  "Suisse",
  "Canada",
  "Luxembourg",
  "Monaco",
  "Maroc",
  "Tunisie",
  "Algérie",
  "Sénégal",
  "Autre",
];

const ageRanges = ["18-25 ans", "26-35 ans", "36-45 ans", "46-55 ans", "56+ ans"];

export const StepProfile = ({ data, updateData, onNext }: StepProfileProps) => {
  const isValid = data.firstName && data.ageRange && data.gender && data.country;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-display font-bold mb-2">Commençons par faire connaissance</h1>
        <p className="text-muted-foreground">
          Ces informations nous permettront de personnaliser votre expérience Tipote™
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input
            id="firstName"
            placeholder="Votre prénom"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
          />
        </div>

        <div className="space-y-3">
          <Label>Tranche d&apos;âge *</Label>
          <Select value={data.ageRange} onValueChange={(value) => updateData({ ageRange: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre tranche d'âge" />
            </SelectTrigger>
            <SelectContent>
              {ageRanges.map((age) => (
                <SelectItem key={age} value={age}>
                  {age}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Genre *</Label>
          <RadioGroup value={data.gender} onValueChange={(value) => updateData({ gender: value })} className="space-y-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="feminin" id="feminin" />
              <Label htmlFor="feminin">Féminin</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="masculin" id="masculin" />
              <Label htmlFor="masculin">Masculin</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="non_genre" id="non_genre" />
              <Label htmlFor="non_genre">Non-genré / Autre</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="prefere_ne_pas_repondre" id="no_answer" />
              <Label htmlFor="no_answer">Je préfère ne pas répondre</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Pays *</Label>
          <Select value={data.country} onValueChange={(value) => updateData({ country: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre pays" />
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

        <Button className="w-full" onClick={onNext} disabled={!isValid}>
          Continuer
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Card>
    </div>
  );
};
