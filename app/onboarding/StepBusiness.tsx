"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, ArrowRight, ArrowLeft, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { OnboardingData, Offer, SocialLink } from "./OnboardingFlow";

interface StepBusinessProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const weeklyHoursOptions = [
  { value: "< 5h", label: "< 5h" },
  { value: "5-10h", label: "5-10h" },
  { value: "10-20h", label: "10-20h" },
  { value: "> 20h", label: "> 20h" },
];

const mainGoal90DaysOptions = [
  { value: "Créer ma première offre", label: "Créer ma première offre" },
  { value: "Construire mon audience", label: "Construire mon audience" },
  { value: "Faire mes premières ventes", label: "Faire mes premières ventes" },
  { value: "Augmenter mon CA", label: "Augmenter mon CA" },
  { value: "Automatiser", label: "Automatiser" },
];

const platforms = ["Instagram", "TikTok", "LinkedIn", "Facebook", "YouTube", "X", "Threads", "Snapchat", "Site web", "Page de vente"];

export const StepBusiness = ({ data, updateData, onNext, onBack }: StepBusinessProps) => {
  const offers = data.offers ?? [];
  const socialLinks = data.socialLinks ?? [];
  const feedback = data.clientFeedback ?? [""];

  const canContinue = useMemo(() => {
    const hasWeekly = (data.weeklyHours || "").trim().length > 0;
    const hasGoal = (data.mainGoal90Days || "").trim().length > 0;
    const hasRevenue = (data.revenueGoalMonthly || "").trim().length > 0;
    const linksOk = socialLinks.length > 0 && socialLinks.every((l) => (l.platform || "").trim() && (l.url || "").trim());
    const offersOk =
      data.hasOffers === false ||
      (data.hasOffers === true &&
        offers.length > 0 &&
        offers.every((o) => (o.name || "").trim() && (o.price || "").trim()));

    return hasWeekly && hasGoal && hasRevenue && linksOk && offersOk;
  }, [data.weeklyHours, data.mainGoal90Days, data.revenueGoalMonthly, data.hasOffers, offers, socialLinks]);

  const updateOffer = (index: number, patch: Partial<Offer>) => {
    const next = [...offers];
    next[index] = { ...next[index], ...patch };
    updateData({ offers: next });
  };

  const addOffer = () => {
    updateData({
      offers: [...offers, { name: "", type: "", price: "", salesCount: "", link: "" }],
    });
  };

  const removeOffer = (index: number) => {
    const next = offers.filter((_, i) => i !== index);
    updateData({ offers: next });
  };

  const updateLink = (index: number, patch: Partial<SocialLink>) => {
    const next = [...socialLinks];
    next[index] = { ...next[index], ...patch };
    updateData({ socialLinks: next });
  };

  const addLink = () => {
    if (socialLinks.length >= 2) return;
    updateData({ socialLinks: [...socialLinks, { platform: "", url: "" }] });
  };

  const removeLink = (index: number) => {
    const next = socialLinks.filter((_, i) => i !== index);
    updateData({ socialLinks: next });
  };

  const updateFeedback = (index: number, value: string) => {
    const next = [...feedback];
    next[index] = value;
    updateData({ clientFeedback: next });
  };

  const addFeedback = () => {
    if (feedback.length >= 2) return;
    updateData({ clientFeedback: [...feedback, ""] });
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Ta situation (socle minimal)</h2>
            <p className="text-muted-foreground">Juste ce qu’il faut pour générer un plan pertinent</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Temps disponible par semaine *</Label>
            <Select value={data.weeklyHours} onValueChange={(value) => updateData({ weeklyHours: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Choisis une option" />
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
            <Label>Objectif de revenus mensuels (même approximatif) *</Label>
            <Input
              value={data.revenueGoalMonthly}
              onChange={(e) => updateData({ revenueGoalMonthly: e.target.value })}
              placeholder="Ex : 2000€/mois"
            />
          </div>

          <div className="space-y-2">
            <Label>Ton objectif prioritaire pour les 90 prochains jours *</Label>
            <Select value={data.mainGoal90Days} onValueChange={(value) => updateData({ mainGoal90Days: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Choisis une option" />
              </SelectTrigger>
              <SelectContent>
                {mainGoal90DaysOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>As-tu déjà des offres à vendre ? *</Label>
            <RadioGroup
              value={data.hasOffers === null ? "" : data.hasOffers ? "yes" : "no"}
              onValueChange={(v) => updateData({ hasOffers: v === "yes" })}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="hasOffersYes" />
                <Label htmlFor="hasOffersYes">Oui</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="hasOffersNo" />
                <Label htmlFor="hasOffersNo">Non</Label>
              </div>
            </RadioGroup>
          </div>

          {data.hasOffers && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Liste tes offres (nom + prix) *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOffer}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>

              {offers.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Ajoute au moins 1 offre (nom + prix) pour que Tipote te conseille mieux.
                </div>
              )}

              <div className="space-y-3">
                {offers.map((offer, idx) => (
                  <div key={idx} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Offre {idx + 1}</div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeOffer(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Nom *</Label>
                        <Input
                          value={offer.name || ""}
                          onChange={(e) => updateOffer(idx, { name: e.target.value })}
                          placeholder="Ex : Coaching 1:1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prix *</Label>
                        <Input
                          value={offer.price || ""}
                          onChange={(e) => updateOffer(idx, { price: e.target.value })}
                          placeholder="Ex : 499€"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Liens à analyser (max 2) *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={socialLinks.length >= 2}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>

            {socialLinks.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Ajoute au moins 1 lien (réseau social, site, page de vente). Ça booste énormément la personnalisation.
              </div>
            )}

            <div className="space-y-3">
              {socialLinks.map((link, idx) => (
                <div key={idx} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LinkIcon className="w-4 h-4" />
                      Lien {idx + 1}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Plateforme *</Label>
                      <Select value={link.platform || ""} onValueChange={(v) => updateLink(idx, { platform: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis" />
                        </SelectTrigger>
                        <SelectContent>
                          {platforms.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>URL *</Label>
                      <Input
                        value={link.url || ""}
                        onChange={(e) => updateLink(idx, { url: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>1–2 retours clients (optionnel mais puissant)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addFeedback} disabled={feedback.length >= 2}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>

            <div className="space-y-3">
              {feedback.map((f, idx) => (
                <div key={idx} className="space-y-2">
                  <Textarea
                    value={f}
                    onChange={(e) => updateFeedback(idx, e.target.value)}
                    placeholder="Copie-colle un message client (mêmes mots, mêmes expressions)."
                    className="min-h-[90px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} size="lg">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button onClick={onNext} disabled={!canContinue} size="lg">
          Continuer
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default StepBusiness;
