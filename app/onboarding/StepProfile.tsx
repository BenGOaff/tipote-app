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

export const StepProfile = ({ data, updateData, onNext }: StepProfileProps) => {
  const isValid = data.firstName && data.country && data.niche && data.missionStatement && data.maturity && data.biggestBlocker;

  return (
    <Card className="p-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-primary/10 rounded-full">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Toi & ton business</h2>
          <p className="text-muted-foreground">Commençons par les bases</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <Label htmlFor="firstName" className="text-sm font-medium">
            Prénom *
          </Label>
          <Input
            id="firstName"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
            placeholder="Ton prénom"
            className="mt-2"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Pays *</Label>
          <Select value={data.country} onValueChange={(value) => updateData({ country: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne ton pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="France">France</SelectItem>
              <SelectItem value="Belgique">Belgique</SelectItem>
              <SelectItem value="Suisse">Suisse</SelectItem>
              <SelectItem value="Canada">Canada</SelectItem>
              <SelectItem value="Autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium">Dans quel domaine exerces-tu ? *</Label>
          <Select value={data.niche} onValueChange={(value) => updateData({ niche: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne ton domaine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Argent & business">Argent & business</SelectItem>
              <SelectItem value="Santé & bien-être">Santé & bien-être</SelectItem>
              <SelectItem value="Développement personnel">Développement personnel</SelectItem>
              <SelectItem value="Relations">Relations</SelectItem>
              <SelectItem value="Autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="missionStatement" className="text-sm font-medium">
            Décris en une phrase : qui aides-tu à faire quoi ? *
          </Label>
          <Textarea
            id="missionStatement"
            value={data.missionStatement}
            onChange={(e) => updateData({ missionStatement: e.target.value })}
            placeholder="J'aide les plombiers à trouver plus de clients grâce à leur fiche Google My Business"
            className="mt-2 min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Où en es-tu aujourd'hui ? *</Label>
          <RadioGroup value={data.maturity} onValueChange={(value) => updateData({ maturity: value })} className="mt-3 space-y-2">
            {[
              { value: "not_launched", label: "Pas encore lancé" },
              { value: "launched_no_sales", label: "Lancé mais pas vendu" },
              { value: "under_500", label: "< 500€/mois" },
              { value: "500_2000", label: "500-2000€/mois" },
              { value: "over_2000", label: "> 2000€/mois" }
            ].map((option) => (
              <div key={option.value} className="flex items-center space-x-2 p-3 rounded-lg border bg-white/50 hover:bg-white/80 transition-colors">
                <RadioGroupItem value={option.value} id={option.value} />
                <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div>
          <Label className="text-sm font-medium">Ton plus gros blocage aujourd'hui *</Label>
          <Select value={data.biggestBlocker} onValueChange={(value) => updateData({ biggestBlocker: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne ton blocage principal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">Manque de temps</SelectItem>
              <SelectItem value="money">Manque d'argent</SelectItem>
              <SelectItem value="knowledge">Manque de connaissance</SelectItem>
              <SelectItem value="organization">Manque d'organisation</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onNext}
          disabled={!isValid}
          className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 transition-all"
        >
          Continuer
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </Card>
  );
};
