import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, ArrowRight, ArrowLeft, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { OnboardingData, Offer, SocialLink } from "./OnboardingFlow";

interface StepBusinessProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const addOffer = () => {
    const newOffer: Offer = {
      name: "",
      type: "",
      price: "",
      salesCount: "",
      link: ""
    };
    updateData({ offers: [...data.offers, newOffer] });
  };

  const updateOffer = (index: number, field: keyof Offer, value: string) => {
    const updatedOffers = [...data.offers];
    updatedOffers[index] = { ...updatedOffers[index], [field]: value };
    updateData({ offers: updatedOffers });
  };

  const removeOffer = (index: number) => {
    const updatedOffers = data.offers.filter((_, i) => i !== index);
    updateData({ offers: updatedOffers });
  };

  const addSocialLink = () => {
    const newLink: SocialLink = {
      platform: "",
      url: ""
    };
    updateData({ socialLinks: [...data.socialLinks, newLink] });
  };

  const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => {
    const updatedLinks = [...data.socialLinks];
    updatedLinks[index] = { ...updatedLinks[index], [field]: value };
    updateData({ socialLinks: updatedLinks });
  };

  const removeSocialLink = (index: number) => {
    const updatedLinks = data.socialLinks.filter((_, i) => i !== index);
    updateData({ socialLinks: updatedLinks });
  };

  const toggleGoal = (goal: string) => {
    const currentGoals = data.mainGoals;
    if (currentGoals.includes(goal)) {
      updateData({ mainGoals: currentGoals.filter(g => g !== goal) });
    } else if (currentGoals.length < 3) {
      updateData({ mainGoals: [...currentGoals, goal] });
    }
  };

  const isValid = data.socialAudience && data.emailListSize && data.weeklyHours && data.mainGoal90Days && data.mainGoals.length > 0;

  return (
    <Card className="p-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-primary/10 rounded-full">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Ta situation actuelle</h2>
          <p className="text-muted-foreground">Parlons de ton business maintenant</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <Label className="text-sm font-medium">As-tu déjà des offres à vendre ? *</Label>
          <RadioGroup
            value={data.hasOffers ? "yes" : "no"}
            onValueChange={(value) => updateData({ hasOffers: value === "yes" })}
            className="mt-3 flex gap-4"
          >
            <div className="flex items-center space-x-2 p-3 rounded-lg border bg-white/50 hover:bg-white/80 transition-colors flex-1">
              <RadioGroupItem value="yes" id="yes" />
              <Label htmlFor="yes" className="flex-1 cursor-pointer font-medium">
                Oui
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 rounded-lg border bg-white/50 hover:bg-white/80 transition-colors flex-1">
              <RadioGroupItem value="no" id="no" />
              <Label htmlFor="no" className="flex-1 cursor-pointer font-medium">
                Non
              </Label>
            </div>
          </RadioGroup>
        </div>

        {data.hasOffers && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Tes offres</Label>
              <Button onClick={addOffer} variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Ajouter une offre
              </Button>
            </div>

            {data.offers.map((offer, index) => (
              <Card key={index} className="p-4 bg-white/50 border">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-medium">Offre {index + 1}</h4>
                  <Button
                    onClick={() => removeOffer(index)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Nom de l'offre</Label>
                    <Input
                      value={offer.name}
                      onChange={(e) => updateOffer(index, "name", e.target.value)}
                      placeholder="Ex: Coaching 1:1"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={offer.type} onValueChange={(value) => updateOffer(index, "type", value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Type d'offre" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coaching">Coaching</SelectItem>
                        <SelectItem value="formation">Formation</SelectItem>
                        <SelectItem value="consulting">Consulting</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="product">Produit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Prix</Label>
                      <Input
                        value={offer.price}
                        onChange={(e) => updateOffer(index, "price", e.target.value)}
                        placeholder="Ex: 997€"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nombre de ventes</Label>
                      <Input
                        value={offer.salesCount}
                        onChange={(e) => updateOffer(index, "salesCount", e.target.value)}
                        placeholder="Ex: 12"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <LinkIcon className="h-3 w-3" />
                      Lien page de vente
                    </Label>
                    <Input
                      value={offer.link}
                      onChange={(e) => updateOffer(index, "link", e.target.value)}
                      placeholder="https://..."
                      className="mt-1"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div>
          <Label className="text-sm font-medium">Taille de ton audience sur les réseaux sociaux *</Label>
          <Select value={data.socialAudience} onValueChange={(value) => updateData({ socialAudience: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne la taille" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0_500">0-500</SelectItem>
              <SelectItem value="500_2000">500-2000</SelectItem>
              <SelectItem value="2000_10000">2000-10000</SelectItem>
              <SelectItem value="10000_plus">10000+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Tes réseaux sociaux (optionnel)</Label>
            <Button onClick={addSocialLink} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>

          {data.socialLinks.map((link, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Plateforme</Label>
                <Select value={link.platform} onValueChange={(value) => updateSocialLink(index, "platform", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Plateforme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">Twitter/X</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-[2]">
                <Label className="text-xs">Lien</Label>
                <Input
                  value={link.url}
                  onChange={(e) => updateSocialLink(index, "url", e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => removeSocialLink(index)}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <Label className="text-sm font-medium">Taille de ta liste email *</Label>
          <Select value={data.emailListSize} onValueChange={(value) => updateData({ emailListSize: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne la taille" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="1_100">1-100</SelectItem>
              <SelectItem value="100_500">100-500</SelectItem>
              <SelectItem value="500_2000">500-2000</SelectItem>
              <SelectItem value="2000_plus">2000+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium">Combien d'heures par semaine peux-tu consacrer à ton business ? *</Label>
          <Select value={data.weeklyHours} onValueChange={(value) => updateData({ weeklyHours: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne le temps disponible" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_5">1-5h</SelectItem>
              <SelectItem value="5_10">5-10h</SelectItem>
              <SelectItem value="10_20">10-20h</SelectItem>
              <SelectItem value="20_plus">20h+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium">Ton objectif principal dans les 90 prochains jours *</Label>
          <Select value={data.mainGoal90Days} onValueChange={(value) => updateData({ mainGoal90Days: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Sélectionne ton objectif" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_sale">Faire ma première vente</SelectItem>
              <SelectItem value="increase_revenue">Augmenter mon chiffre d'affaires</SelectItem>
              <SelectItem value="grow_audience">Développer mon audience</SelectItem>
              <SelectItem value="launch_offer">Lancer une nouvelle offre</SelectItem>
              <SelectItem value="improve_systems">Améliorer mes systèmes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium">Quels sont tes 3 objectifs principaux ? *</Label>
          <p className="text-xs text-muted-foreground mt-1">Sélectionne jusqu'à 3 objectifs</p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {[
              "Obtenir plus de clients",
              "Augmenter mes prix",
              "Automatiser mon business",
              "Créer du contenu plus facilement",
              "Avoir plus de temps libre",
              "Me sentir plus confiant(e)",
              "Arrêter de procrastiner",
              "Être plus organisé(e)"
            ].map((goal) => (
              <button
                key={goal}
                onClick={() => toggleGoal(goal)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  data.mainGoals.includes(goal)
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-white/50 hover:bg-white/80"
                }`}
              >
                {goal}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <Button onClick={onBack} variant="outline" className="flex-1 h-12 gap-2">
            <ArrowLeft className="h-5 w-5" />
            Retour
          </Button>
          <Button
            onClick={onNext}
            disabled={!isValid}
            className="flex-1 h-12 gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            Continuer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
