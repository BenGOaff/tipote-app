"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import type { OnboardingData, GenderValue } from "./OnboardingFlow";

interface StepProfileProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  loading?: boolean;
}

const ageRanges = [
  { value: "18-24", label: "18-24" },
  { value: "25-34", label: "25-34" },
  { value: "35-44", label: "35-44" },
  { value: "45-54", label: "45-54" },
  { value: "55+", label: "55+" },
];

const genders: { value: GenderValue; label: string }[] = [
  { value: "masculin", label: "Masculin" },
  { value: "feminin", label: "Féminin" },
  { value: "non_genre", label: "Non genré" },
  { value: "prefere_ne_pas_repondre", label: "Je préfère ne pas répondre" },
];

export function StepProfile({ data, updateData, onNext, loading }: StepProfileProps) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold mb-2">Commençons par vous</h1>
        <p className="text-muted-foreground">
          Ces informations nous aideront à personnaliser votre expérience Tipote™.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom</Label>
          <Input
            id="firstName"
            placeholder="Votre prénom"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Tranche d’âge</Label>
            <Select value={data.ageRange} onValueChange={(v) => updateData({ ageRange: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une tranche" />
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
            <Label>Sexe</Label>
            <Select
              value={data.gender}
              onValueChange={(v) => updateData({ gender: v as GenderValue })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {genders.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Pays</Label>
          <Input
            id="country"
            placeholder="France"
            value={data.country}
            onChange={(e) => updateData({ country: e.target.value })}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={Boolean(loading)}>
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
