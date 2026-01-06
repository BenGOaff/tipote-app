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
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { BusinessTypeValue, NicheValue, OnboardingData, RevenueMaturityValue } from "./OnboardingFlow";

interface StepBusinessProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading?: boolean;
}

const niches: { value: NicheValue; label: string }[] = [
  { value: "argent", label: "Argent" },
  { value: "sante_bien_etre", label: "Santé / Bien-être" },
  { value: "dev_perso", label: "Développement personnel" },
  { value: "relations", label: "Relations" },
];

const businessTypes: { value: BusinessTypeValue; label: string }[] = [
  { value: "physique", label: "Business physique" },
  { value: "coaching", label: "Coaching" },
  { value: "formation", label: "Formation" },
  { value: "saas", label: "SaaS" },
  { value: "freelance", label: "Freelance" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "autre", label: "Autre" },
];

const maturities: { value: RevenueMaturityValue; label: string }[] = [
  { value: "0-500", label: "0–500€ / mois" },
  { value: "500-5000", label: "500–5k€ / mois" },
  { value: "5000+", label: "5k€+ / mois" },
];

const toolsList = ["Systeme.io", "Trello", "Canva", "n8n", "Zapier", "Make", "Autre"];

export function StepBusiness({ data, updateData, onNext, onBack, loading }: StepBusinessProps) {
  const toggleTool = (tool: string) => {
    const current = data.toolsUsed || [];
    if (current.includes(tool)) {
      updateData({ toolsUsed: current.filter((t) => t !== tool) });
    } else {
      updateData({ toolsUsed: [...current, tool] });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold mb-2">Parlons de votre business</h1>
        <p className="text-muted-foreground">
          Ces réponses alimentent votre profil et serviront à créer votre persona et vos offres.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label>Niche</Label>
          <Select value={data.niche} onValueChange={(v) => updateData({ niche: v as NicheValue })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre niche" />
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
          <Label htmlFor="personaQuestion">Qui veux-tu aider à faire quoi et comment ?</Label>
          <Textarea
            id="personaQuestion"
            placeholder="Ex : J’aide les solopreneurs à structurer une offre premium grâce à une méthode simple…"
            value={data.personaQuestion}
            onChange={(e) => updateData({ personaQuestion: e.target.value })}
            rows={4}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Type de business</Label>
            <Select
              value={data.businessType}
              onValueChange={(v) => updateData({ businessType: v as BusinessTypeValue })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {businessTypes.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {data.businessType === "autre" && (
            <div className="space-y-2">
              <Label htmlFor="businessTypeOther">Précisez</Label>
              <Input
                id="businessTypeOther"
                placeholder="Votre type de business"
                value={data.businessTypeOther}
                onChange={(e) => updateData({ businessTypeOther: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Maturité CA</Label>
            <Select
              value={data.revenueMaturity}
              onValueChange={(v) => updateData({ revenueMaturity: v as RevenueMaturityValue })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {maturities.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="audienceSocial">Taille audience (réseaux)</Label>
            <Input
              id="audienceSocial"
              placeholder="Ex : 12000"
              value={data.audienceSocial}
              onChange={(e) => updateData({ audienceSocial: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audienceEmail">Taille audience (emails)</Label>
            <Input
              id="audienceEmail"
              placeholder="Ex : 800"
              value={data.audienceEmail}
              onChange={(e) => updateData({ audienceEmail: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Outils utilisés</Label>
          <div className="flex flex-wrap gap-2">
            {toolsList.map((tool) => {
              const active = (data.toolsUsed || []).includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={[
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  {tool}
                </button>
              );
            })}
          </div>

          {(data.toolsUsed || []).includes("Autre") && (
            <div className="space-y-2">
              <Label htmlFor="toolsOther">Précisez les outils</Label>
              <Input
                id="toolsOther"
                placeholder="Ex : Airtable, Hubspot…"
                value={data.toolsOther}
                onChange={(e) => updateData({ toolsOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeAvailable">Temps disponible par semaine</Label>
          <Input
            id="timeAvailable"
            placeholder="Ex : 5h, 10h, 20h…"
            value={data.timeAvailable}
            onChange={(e) => updateData({ timeAvailable: e.target.value })}
          />
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={Boolean(loading)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button onClick={onNext} disabled={Boolean(loading)}>
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
