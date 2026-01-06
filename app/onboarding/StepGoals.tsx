"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import type { ContentPreferenceValue, OnboardingData } from "./OnboardingFlow";

interface StepGoalsProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

const psychologicalChoices = [
  "Se sentir fier",
  "Se sentir utile",
  "Avoir du temps libre",
  "Quitter le salariat",
  "Améliorer la retraite",
  "Aider les autres",
  "Liberté financière",
  "Autre",
];

const contentPreferences: { value: ContentPreferenceValue; label: string }[] = [
  { value: "ecriture", label: "Écriture" },
  { value: "video", label: "Vidéo" },
];

const tones = [
  { value: "direct", label: "Direct" },
  { value: "bienveillant", label: "Bienveillant" },
  { value: "expert", label: "Expert" },
  { value: "humoristique", label: "Humoristique" },
];

export function StepGoals({ data, updateData, onComplete, onBack, isSubmitting }: StepGoalsProps) {
  const togglePsyGoal = (label: string) => {
    const current = data.psychologicalGoals || [];
    if (current.includes(label)) {
      updateData({ psychologicalGoals: current.filter((g) => g !== label) });
    } else {
      updateData({ psychologicalGoals: [...current, label] });
    }
  };

  const isValid = true;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold mb-2">Vos objectifs</h1>
        <p className="text-muted-foreground">
          Dernière étape : on aligne vos objectifs pour générer votre stratégie.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="monthlyNetGoal">Objectif financier mensuel net</Label>
          <Input
            id="monthlyNetGoal"
            placeholder="Ex : 5000€"
            value={data.monthlyNetGoal}
            onChange={(e) => updateData({ monthlyNetGoal: e.target.value })}
          />
        </div>

        <div className="space-y-3">
          <Label>Objectif psychologique (plusieurs choix possibles)</Label>
          <div className="flex flex-wrap gap-2">
            {psychologicalChoices.map((p) => {
              const active = (data.psychologicalGoals || []).includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePsyGoal(p)}
                  className={[
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {(data.psychologicalGoals || []).includes("Autre") && (
            <div className="space-y-2">
              <Label htmlFor="psychologicalGoalsOther">Précisez</Label>
              <Textarea
                id="psychologicalGoalsOther"
                placeholder="Votre objectif psychologique…"
                value={data.psychologicalGoalsOther}
                onChange={(e) => updateData({ psychologicalGoalsOther: e.target.value })}
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Préférence contenu</Label>
            <Select
              value={data.contentPreference}
              onValueChange={(v) => updateData({ contentPreference: v as ContentPreferenceValue })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisissez" />
              </SelectTrigger>
              <SelectContent>
                {contentPreferences.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ton préféré pour les contenus</Label>
            <Select value={data.preferredTone} onValueChange={(v) => updateData({ preferredTone: v })}>
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
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={Boolean(isSubmitting)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button onClick={onComplete} disabled={!isValid || Boolean(isSubmitting)} size="lg">
            Terminer
          </Button>
        </div>
      </Card>
    </div>
  );
}
