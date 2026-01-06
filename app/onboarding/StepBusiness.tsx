import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  { value: "argent", label: "💰 Argent & finances" },
  { value: "business", label: "🚀 Business & entrepreneuriat" },
  { value: "marketing", label: "📈 Marketing & acquisition" },
  { value: "coaching", label: "🌟 Coaching & développement" },
  { value: "sante", label: "🏃‍♀️ Santé & bien-être" },
  { value: "relation", label: "❤️ Relations & lifestyle" },
];

const businessTypes = [
  { value: "coaching", label: "Coaching / Consulting" },
  { value: "formation", label: "Formation en ligne" },
  { value: "service", label: "Service / Agence" },
  { value: "produit", label: "Produit digital" },
  { value: "autre", label: "Autre" },
];

const maturityLevels = [
  { value: "ideation", label: "Idée / Recherche" },
  { value: "lancement", label: "Lancement" },
  { value: "croissance", label: "Croissance" },
  { value: "scale", label: "Scale" },
];

const timeOptions = [
  { value: "moins_2h", label: "Moins de 2h/semaine" },
  { value: "2_5h", label: "2-5h/semaine" },
  { value: "5_10h", label: "5-10h/semaine" },
  { value: "plus_10h", label: "Plus de 10h/semaine" },
];

const tools = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "Email marketing",
  "Publicités",
  "Site web",
  "Podcast",
];

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const isValid = data.niche && data.persona && data.businessType && data.maturity && data.weeklyTime;

  const toggleTool = (tool: string) => {
    const current = data.toolsUsed || [];
    if (current.includes(tool)) {
      updateData({ toolsUsed: current.filter((t) => t !== tool) });
    } else {
      updateData({ toolsUsed: [...current, tool] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Briefcase className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-display font-bold mb-2">
          Parlez-nous de votre business
        </h1>
        <p className="text-muted-foreground text-lg">
          Ces informations nous aideront à créer votre stratégie personnalisée
        </p>
      </div>

      <Card className="p-8 space-y-6">
        <div className="space-y-3">
          <Label>Dans quel domaine évoluez-vous ? *</Label>
          <RadioGroup
            value={data.niche}
            onValueChange={(value) => updateData({ niche: value })}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {niches.map((niche) => (
              <div key={niche.value} className="flex items-center space-x-2">
                <RadioGroupItem value={niche.value} id={niche.value} className="peer sr-only" />
                <Label
                  htmlFor={niche.value}
                  className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-background p-3 font-medium transition-all hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  {niche.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="persona">
            Décrivez en 1 phrase qui vous aidez et comment *
          </Label>
          <Textarea
            id="persona"
            placeholder="Ex: J'aide les femmes entrepreneurs à créer un business en ligne rentable"
            value={data.persona}
            onChange={(e) => updateData({ persona: e.target.value })}
            className="min-h-[100px] resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Type de business *</Label>
          <Select value={data.businessType} onValueChange={(value) => updateData({ businessType: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre type de business" />
            </SelectTrigger>
            <SelectContent>
              {businessTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Niveau de maturité *</Label>
          <Select value={data.maturity} onValueChange={(value) => updateData({ maturity: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Où en êtes-vous ?" />
            </SelectTrigger>
            <SelectContent>
              {maturityLevels.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="audience">Taille de votre audience</Label>
            <Input
              id="audience"
              placeholder="Ex: 1000"
              value={data.audienceSize}
              onChange={(e) => updateData({ audienceSize: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Temps disponible par semaine *</Label>
            <Select value={data.weeklyTime} onValueChange={(value) => updateData({ weeklyTime: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasOffers"
              checked={data.hasOffers}
              onCheckedChange={(checked) => updateData({ hasOffers: !!checked })}
            />
            <Label htmlFor="hasOffers" className="font-medium">
              J&apos;ai déjà une offre payante
            </Label>
          </div>

          {data.hasOffers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="offerPrice">Prix moyen (€)</Label>
                <Input
                  id="offerPrice"
                  placeholder="Ex: 997"
                  value={data.offerPrice}
                  onChange={(e) => updateData({ offerPrice: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offerSales">Nombre de ventes</Label>
                <Input
                  id="offerSales"
                  placeholder="Ex: 10"
                  value={data.offerSalesCount}
                  onChange={(e) => updateData({ offerSalesCount: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Outils utilisés (optionnel)</Label>
          <div className="grid grid-cols-2 gap-3">
            {tools.map((tool) => (
              <div key={tool} className="flex items-center space-x-2">
                <Checkbox
                  id={tool}
                  checked={data.toolsUsed?.includes(tool)}
                  onCheckedChange={() => toggleTool(tool)}
                />
                <Label htmlFor={tool} className="text-sm">
                  {tool}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button onClick={onBack} variant="outline" size="lg">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuer
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
