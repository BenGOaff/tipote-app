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

// ✅ Niches CDC + Lovable
const niches = [
  { value: "argent", label: "💰 Argent & Business" },
  { value: "sante", label: "🏃 Santé & Bien-être" },
  { value: "devperso", label: "🧠 Développement personnel" },
  { value: "relations", label: "❤️ Relations" },
];

// ✅ Types business CDC
const businessTypes = [
  { value: "physique", label: "Business physique (local / boutique)" },
  { value: "coaching", label: "Coaching / Consulting" },
  { value: "formation", label: "Formation en ligne" },
  { value: "saas", label: "SaaS / App" },
  { value: "freelance", label: "Freelance / Prestataire" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "autre", label: "Autre" },
];

// ✅ Maturité CA CDC
const maturities = [
  { value: "0-500", label: "0 - 500€/mois" },
  { value: "500-5000", label: "500€ - 5k€/mois" },
  { value: "5000+", label: "5k€+/mois" },
];

// ✅ Audience CDC (on sépare social/email)
const audienceSizes = [
  { value: "0-500", label: "0 - 500" },
  { value: "500-2000", label: "500 - 2 000" },
  { value: "2000-10000", label: "2 000 - 10 000" },
  { value: "10000+", label: "10 000+" },
];

// ✅ Outils CDC (liste resserrée)
const toolsList = ["Systeme.io", "Trello", "Canva", "n8n", "Zapier", "Make", "Autre"];

// ✅ Temps dispo CDC
const weeklyTimes = [
  { value: "1-5h", label: "1-5 heures" },
  { value: "5-10h", label: "5-10 heures" },
  { value: "10-20h", label: "10-20 heures" },
  { value: "20h+", label: "20+ heures" },
];

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const toggleTool = (tool: string) => {
    const current = data.toolsUsed || [];
    if (current.includes(tool)) {
      updateData({ toolsUsed: current.filter((t) => t !== tool) });
    } else {
      updateData({ toolsUsed: [...current, tool] });
    }
  };

  const isValid =
    !!data.niche &&
    !!data.persona &&
    !!data.businessType &&
    !!data.businessMaturity &&
    !!data.audienceSocial &&
    !!data.audienceEmail &&
    !!data.timeAvailable;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <Briefcase className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-display font-bold mb-2">Parlons de votre business</h2>
        <p className="text-muted-foreground text-lg">
          Ces informations nous aideront à créer votre stratégie personnalisée
        </p>
      </div>

      <Card className="p-8 shadow-lg border-0 bg-background/80 backdrop-blur-sm space-y-6">
        <div className="space-y-3">
          <Label>Quelle est votre niche ? *</Label>
          <RadioGroup
            value={data.niche}
            onValueChange={(value) => updateData({ niche: value })}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {niches.map((niche) => (
              <div key={niche.value} className="flex items-center">
                <RadioGroupItem value={niche.value} id={niche.value} className="peer sr-only" />
                <Label
                  htmlFor={niche.value}
                  className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-background p-4 text-center text-sm font-medium transition-all hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  {niche.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {data.niche === "autre" && (
            <div className="space-y-2">
              <Label htmlFor="nicheOther">Précisez votre niche</Label>
              <Input
                id="nicheOther"
                placeholder="Ex: Nutrition sportive..."
                value={data.nicheOther}
                onChange={(e) => updateData({ nicheOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="persona">Qui veux-tu aider à faire quoi et comment ? *</Label>
          <Textarea
            id="persona"
            placeholder="Ex: J'aide les entrepreneurs à automatiser leur marketing grâce à l'IA..."
            value={data.persona}
            onChange={(e) => updateData({ persona: e.target.value })}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="space-y-3">
          <Label>Type de business *</Label>
          <Select value={data.businessType} onValueChange={(value) => updateData({ businessType: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre type de business" />
            </SelectTrigger>
            <SelectContent>
              {businessTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {data.businessType === "autre" && (
            <div className="space-y-2">
              <Label htmlFor="businessTypeOther">Précisez votre type de business</Label>
              <Input
                id="businessTypeOther"
                placeholder="Ex: Agence..."
                value={data.businessTypeOther}
                onChange={(e) => updateData({ businessTypeOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Maturité (CA mensuel) *</Label>
          <Select value={data.businessMaturity} onValueChange={(value) => updateData({ businessMaturity: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre niveau" />
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label>Taille audience (réseaux) *</Label>
            <Select value={data.audienceSocial} onValueChange={(value) => updateData({ audienceSocial: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {audienceSizes.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Taille audience (emails) *</Label>
            <Select value={data.audienceEmail} onValueChange={(value) => updateData({ audienceEmail: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez" />
              </SelectTrigger>
              <SelectContent>
                {audienceSizes.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="hasOffers"
              checked={data.hasOffers}
              onCheckedChange={(checked) => updateData({ hasOffers: !!checked })}
            />
            <Label htmlFor="hasOffers">J'ai déjà des offres payantes</Label>
          </div>

          {data.hasOffers && (
            <div className="space-y-4 ml-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="offerPrice">Prix moyen</Label>
                  <Input
                    id="offerPrice"
                    placeholder="Ex: 497€"
                    value={data.offerPrice}
                    onChange={(e) => updateData({ offerPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offerSales">Nombre de ventes</Label>
                  <Input
                    id="offerSales"
                    placeholder="Ex: 50"
                    value={data.offerSalesCount}
                    onChange={(e) => updateData({ offerSalesCount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offerSalesPageLinks">Liens pages de vente</Label>
                <Input
                  id="offerSalesPageLinks"
                  placeholder="Collez 1 ou plusieurs liens, séparés par des virgules"
                  value={data.offerSalesPageLinks}
                  onChange={(e) => updateData({ offerSalesPageLinks: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Outils utilisés *</Label>
          <div className="flex flex-wrap gap-2">
            {toolsList.map((tool) => (
              <div
                key={tool}
                onClick={() => toggleTool(tool)}
                className={`px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm font-medium ${
                  (data.toolsUsed || []).includes(tool)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                {tool}
              </div>
            ))}
          </div>

          {(data.toolsUsed || []).includes("Autre") && (
            <div className="space-y-2">
              <Label htmlFor="toolsOther">Précisez les outils</Label>
              <Input
                id="toolsOther"
                placeholder="Ex: Airtable, Hubspot..."
                value={data.toolsOther}
                onChange={(e) => updateData({ toolsOther: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Temps disponible par semaine *</Label>
          <Select value={data.timeAvailable} onValueChange={(value) => updateData({ timeAvailable: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez votre disponibilité" />
            </SelectTrigger>
            <SelectContent>
              {weeklyTimes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
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

export default StepBusiness;
