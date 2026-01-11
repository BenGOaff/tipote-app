import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase, ArrowRight, ArrowLeft, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { OnboardingData, Offer, SocialLink } from "./OnboardingFlow";

interface StepBusinessProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const offerTypes = [
  { value: "coaching", label: "Coaching" },
  { value: "consulting", label: "Consulting" },
  { value: "formation", label: "Formation" },
  { value: "service", label: "Service" },
  { value: "product", label: "Produit" },
  { value: "autre", label: "Autre" },
];

const socialAudienceRanges = ["0-500", "500-2000", "2000-10000", "10000+"];

const socials = [
  { value: "Facebook", label: "Facebook" },
  { value: "Linkedin", label: "Linkedin" },
  { value: "X", label: "X" },
  { value: "Instagram", label: "Instagram" },
  { value: "Snapchat", label: "Snapchat" },
  { value: "Threads", label: "Threads" },
  { value: "TikTok", label: "TikTok" },
];

const weeklyHoursOptions = [
  { value: "< 5h", label: "< 5h" },
  { value: "5-10h", label: "5-10h" },
  { value: "10-20h", label: "10-20h" },
  { value: "> 20h", label: "> 20h" },
];

const mainGoal90Options = [
  { value: "Créer ma première offre", label: "Créer ma première offre" },
  { value: "Construire mon audience", label: "Construire mon audience" },
  { value: "Faire mes premières ventes", label: "Faire mes premières ventes" },
  { value: "Augmenter mon CA", label: "Augmenter mon CA" },
  { value: "Automatiser", label: "Automatiser" },
];

const mainGoalsOptions = [
  { value: "devenir riche", label: "Devenir riche" },
  { value: "être fier de mes activités", label: "Être fier de mes activités" },
  { value: "aider les autres", label: "Aider les autres" },
  { value: "avoir plus de temps libre", label: "Avoir plus de temps libre" },
];

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const setHasOffers = (val: boolean) => {
    updateData({
      hasOffers: val,
      offers: val ? data.offers : [],
    });
  };

  const addOffer = () => {
    const newOffer: Offer = { name: "", type: "", price: "", salesCount: "", link: "" };
    updateData({ offers: [...data.offers, newOffer] });
  };

  const updateOffer = (index: number, field: keyof Offer, value: string) => {
    const updated = [...data.offers];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ offers: updated });
  };

  const removeOffer = (index: number) => {
    updateData({ offers: data.offers.filter((_, i) => i !== index) });
  };

  const toggleSocial = (platform: string) => {
    const current = data.socialLinks ?? [];
    const exists = current.find((s) => s.platform === platform);

    if (exists) {
      updateData({ socialLinks: current.filter((s) => s.platform !== platform) });
      return;
    }

    if (current.length >= 2) return;

    const next: SocialLink = { platform, url: "" };
    updateData({ socialLinks: [...current, next] });
  };

  const updateSocialUrl = (platform: string, url: string) => {
    const current = data.socialLinks ?? [];
    updateData({
      socialLinks: current.map((s) => (s.platform === platform ? { ...s, url } : s)),
    });
  };

  const toggleMainGoal = (goal: string) => {
    const current = data.mainGoals ?? [];
    if (current.includes(goal)) {
      updateData({ mainGoals: current.filter((g) => g !== goal) });
      return;
    }
    if (current.length >= 2) return;
    updateData({ mainGoals: [...current, goal] });
  };

  const isValid =
    data.hasOffers !== null &&
    !!data.socialAudience &&
    !!data.emailListSize &&
    !!data.weeklyHours &&
    !!data.mainGoal90Days &&
    !!data.revenueGoalMonthly &&
    (data.mainGoals?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Ta situation actuelle</h2>
            <p className="text-muted-foreground">Questions essentielles (obligatoire)</p>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <Label>As-tu déjà des offres à vendre ? *</Label>
            <RadioGroup
              value={data.hasOffers === null ? "" : data.hasOffers ? "yes" : "no"}
              onValueChange={(v) => setHasOffers(v === "yes")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2 p-4 border rounded-lg flex-1 hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="yes" id="has-offers-yes" />
                <Label htmlFor="has-offers-yes" className="cursor-pointer font-normal">
                  Oui
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-4 border rounded-lg flex-1 hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="no" id="has-offers-no" />
                <Label htmlFor="has-offers-no" className="cursor-pointer font-normal">
                  Non
                </Label>
              </div>
            </RadioGroup>
          </div>

          {data.hasOffers ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>(Si oui) Liste tes offres</Label>
                <Button onClick={addOffer} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>

              {(data.offers ?? []).map((offer, idx) => (
                <Card key={idx} className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-medium">Offre {idx + 1}</div>
                    <Button
                      onClick={() => removeOffer(idx)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nom</Label>
                      <Input
                        value={offer.name}
                        onChange={(e) => updateOffer(idx, "name", e.target.value)}
                        placeholder="Ex : Coaching 1:1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={offer.type} onValueChange={(v) => updateOffer(idx, "type", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis un type" />
                        </SelectTrigger>
                        <SelectContent>
                          {offerTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Prix</Label>
                        <Input
                          value={offer.price}
                          onChange={(e) => updateOffer(idx, "price", e.target.value)}
                          placeholder="Ex : 997€"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nb ventes</Label>
                        <Input
                          value={offer.salesCount}
                          onChange={(e) => updateOffer(idx, "salesCount", e.target.value)}
                          placeholder="Ex : 12"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" />
                        Lien (page de vente)
                      </Label>
                      <Input
                        value={offer.link}
                        onChange={(e) => updateOffer(idx, "link", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Taille de ton audience réseaux (environ) *</Label>
            <Select value={data.socialAudience} onValueChange={(v) => updateData({ socialAudience: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne un range" />
              </SelectTrigger>
              <SelectContent>
                {socialAudienceRanges.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Les principaux réseaux que tu utilises (2 maxi)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {socials.map((s) => {
                const checked = (data.socialLinks ?? []).some((x) => x.platform === s.value);
                const disabled = !checked && (data.socialLinks ?? []).length >= 2;

                return (
                  <label
                    key={s.value}
                    className={`flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/30 transition-colors ${
                      disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        if (disabled) return;
                        toggleSocial(s.value);
                      }}
                    />
                    <span className="font-normal">{s.label}</span>
                  </label>
                );
              })}
            </div>

            {(data.socialLinks ?? []).length > 0 ? (
              <div className="space-y-3">
                {(data.socialLinks ?? []).map((link) => (
                  <div key={link.platform} className="space-y-2">
                    <Label>Lien profil — {link.platform}</Label>
                    <Input
                      value={link.url}
                      onChange={(e) => updateSocialUrl(link.platform, e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Nombre d'emails dans ta liste (environ) *</Label>
            <Input
              value={data.emailListSize}
              onChange={(e) => updateData({ emailListSize: e.target.value })}
              placeholder="Ex : 0 / 120 / 1500"
            />
          </div>

          <div className="space-y-2">
            <Label>Temps disponible par semaine pour ton business *</Label>
            <Select value={data.weeklyHours} onValueChange={(v) => updateData({ weeklyHours: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne une option" />
              </SelectTrigger>
              <SelectContent>
                {weeklyHoursOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ton objectif prioritaire pour les 90 prochains jours *</Label>
            <Select value={data.mainGoal90Days} onValueChange={(v) => updateData({ mainGoal90Days: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne une option" />
              </SelectTrigger>
              <SelectContent>
                {mainGoal90Options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ✅ NOUVELLE QUESTION (avant les objectifs "devenir riche...") */}
          <div className="space-y-2">
            <Label>Quel est ton objectif de revenus mensuels ? *</Label>
            <div className="relative">
              <Input
                value={data.revenueGoalMonthly}
                onChange={(e) => {
                  const next = (e.target.value ?? "").replace(/[^\d]/g, "");
                  updateData({ revenueGoalMonthly: next });
                }}
                placeholder="Ex : 5000"
                inputMode="numeric"
                className="pr-16"
              />
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">
                € / mois
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Ton objectif principal avec ton business, au delà de l’argent (2 choix possibles) *</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mainGoalsOptions.map((g) => {
                const checked = (data.mainGoals ?? []).includes(g.value);
                const disabled = !checked && (data.mainGoals ?? []).length >= 2;

                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      toggleMainGoal(g.value);
                    }}
                    className={`p-4 border rounded-lg text-left hover:bg-muted/30 transition-colors ${
                      checked ? "bg-primary/10 border-primary text-primary" : ""
                    } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
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
