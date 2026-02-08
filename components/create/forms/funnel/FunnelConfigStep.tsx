import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Wand2, Coins, ImageIcon, Link2 } from "lucide-react";
import { type SystemeTemplate } from "@/data/systemeTemplates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FunnelOfferOption = { id: string; name: string };

interface FunnelConfigStepProps {
  mode: "visual" | "text_only";
  selectedTemplate: SystemeTemplate | null;

  funnelPageType: "capture" | "sales";
  setFunnelPageType: (type: "capture" | "sales") => void;

  // Offer linking (existing offers)
  offers: FunnelOfferOption[];
  offerChoice: "existing" | "scratch";
  setOfferChoice: (v: "existing" | "scratch") => void;
  selectedOfferId: string;
  setSelectedOfferId: (v: string) => void;

  // Manual offer fields (when scratch)
  offerName: string;
  setOfferName: (v: string) => void;
  offerPromise: string;
  setOfferPromise: (v: string) => void;
  offerTarget: string;
  setOfferTarget: (v: string) => void;
  offerPrice: string;
  setOfferPrice: (v: string) => void;

  urgency: string;
  setUrgency: (v: string) => void;
  guarantee: string;
  setGuarantee: (v: string) => void;

  // Visual mode extra fields (assets + legal links)
  authorName: string;
  setAuthorName: (v: string) => void;
  authorPhotoUrl: string;
  setAuthorPhotoUrl: (v: string) => void;
  offerMockupUrl: string;
  setOfferMockupUrl: (v: string) => void;
  testimonials: string;
  setTestimonials: (v: string) => void;

  legalMentionsUrl: string;
  setLegalMentionsUrl: (v: string) => void;
  legalPrivacyUrl: string;
  setLegalPrivacyUrl: (v: string) => void;
  legalCgvUrl: string;
  setLegalCgvUrl: (v: string) => void;

  isGenerating: boolean;
  onGenerate: () => void;
  onBack: () => void;
  creditCost: number;
}

export function FunnelConfigStep({
  mode,
  selectedTemplate,
  funnelPageType,
  setFunnelPageType,

  offers,
  offerChoice,
  setOfferChoice,
  selectedOfferId,
  setSelectedOfferId,

  offerName,
  setOfferName,
  offerPromise,
  setOfferPromise,
  offerTarget,
  setOfferTarget,
  offerPrice,
  setOfferPrice,

  urgency,
  setUrgency,
  guarantee,
  setGuarantee,

  authorName,
  setAuthorName,
  authorPhotoUrl,
  setAuthorPhotoUrl,
  offerMockupUrl,
  setOfferMockupUrl,
  testimonials,
  setTestimonials,

  legalMentionsUrl,
  setLegalMentionsUrl,
  legalPrivacyUrl,
  setLegalPrivacyUrl,
  legalCgvUrl,
  setLegalCgvUrl,

  isGenerating,
  onGenerate,
  onBack,
  creditCost,
}: FunnelConfigStepProps) {
  const showVisualExtras = mode === "visual";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Infos de ta page</h3>
          <p className="text-sm text-muted-foreground">
            L’IA utilise ton persona, tes ressources Tipote et les caractéristiques de l’offre.
          </p>
        </div>

        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      {showVisualExtras && selectedTemplate ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold">{selectedTemplate.name}</div>
              <div className="text-xs text-muted-foreground">{selectedTemplate.description}</div>
            </div>
            <Badge variant="secondary">{selectedTemplate.type === "capture" ? "Capture" : "Vente"}</Badge>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Type de page</Label>
              <Badge variant="secondary">{funnelPageType === "capture" ? "Capture" : "Vente"}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={funnelPageType === "capture" ? "default" : "outline"}
                onClick={() => setFunnelPageType("capture")}
              >
                Capture
              </Button>
              <Button
                type="button"
                variant={funnelPageType === "sales" ? "default" : "outline"}
                onClick={() => setFunnelPageType("sales")}
              >
                Vente
              </Button>
            </div>

            <div className="pt-2">
              <Label>Offre</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={offerChoice === "existing" ? "default" : "outline"}
                  onClick={() => setOfferChoice("existing")}
                  disabled={offers.length === 0}
                >
                  Offre existante
                </Button>
                <Button
                  type="button"
                  variant={offerChoice === "scratch" ? "default" : "outline"}
                  onClick={() => setOfferChoice("scratch")}
                >
                  À partir de zéro
                </Button>
              </div>

              {offerChoice === "existing" ? (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Choisis une offre, tu n’auras pas à tout re-renseigner.
                  </Label>
                  <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                    <SelectTrigger>
                      <SelectValue placeholder={offers.length ? "Sélectionne une offre" : "Aucune offre disponible"} />
                    </SelectTrigger>
                    <SelectContent>
                      {offers.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Nom de l’offre</Label>
                    <Input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="ex: Plan d’action 90 jours" />
                  </div>

                  <div className="space-y-2">
                    <Label>Promesse</Label>
                    <Textarea
                      value={offerPromise}
                      onChange={(e) => setOfferPromise(e.target.value)}
                      placeholder="ex: Trouver tes 10 prochains clients en 90 jours"
                      className="min-h-[90px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cible</Label>
                    <Input value={offerTarget} onChange={(e) => setOfferTarget(e.target.value)} placeholder="ex: Coachs / freelances / e-commerçants…" />
                  </div>

                  <div className="space-y-2">
                    <Label>Prix</Label>
                    <Input value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="ex: 49€ / 490€ / 1997€" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Angles & persuasion</Label>
              <Badge variant="secondary" className="gap-1">
                <Coins className="h-3.5 w-3.5" />
                {creditCost} crédits
              </Badge>
            </div>

            <div className="space-y-2">
              <Label>Urgence (optionnel)</Label>
              <Input value={urgency} onChange={(e) => setUrgency(e.target.value)} placeholder="ex: Offre valable jusqu’à dimanche" />
            </div>

            <div className="space-y-2">
              <Label>Garantie (optionnel)</Label>
              <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="ex: Satisfait ou remboursé 14 jours" />
            </div>

            {showVisualExtras ? (
              <div className="pt-2 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="h-4 w-4" />
                  Éléments du template (optionnels)
                </div>

                <div className="space-y-2">
                  <Label>Nom de l’auteur / marque</Label>
                  <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="ex: Tipote" />
                </div>

                <div className="space-y-2">
                  <Label>Photo auteur (URL)</Label>
                  <Input value={authorPhotoUrl} onChange={(e) => setAuthorPhotoUrl(e.target.value)} placeholder="https://..." />
                </div>

                <div className="space-y-2">
                  <Label>Mockup de l’offre (URL)</Label>
                  <Input value={offerMockupUrl} onChange={(e) => setOfferMockupUrl(e.target.value)} placeholder="https://..." />
                </div>

                <div className="space-y-2">
                  <Label>Témoignages (1 par ligne)</Label>
                  <Textarea
                    value={testimonials}
                    onChange={(e) => setTestimonials(e.target.value)}
                    placeholder={`ex:\n“Incroyable, j’ai signé 3 clients.” — Sarah\n“Simple et efficace.” — Lucas`}
                    className="min-h-[90px]"
                  />
                </div>

                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4" />
                  Liens légaux
                </div>

                <div className="space-y-2">
                  <Label>Mentions légales (URL)</Label>
                  <Input value={legalMentionsUrl} onChange={(e) => setLegalMentionsUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Politique de confidentialité (URL)</Label>
                  <Input value={legalPrivacyUrl} onChange={(e) => setLegalPrivacyUrl(e.target.value)} placeholder="https://..." />
                </div>
                {funnelPageType === "sales" ? (
                  <div className="space-y-2">
                    <Label>CGV et politique (URL)</Label>
                    <Input value={legalCgvUrl} onChange={(e) => setLegalCgvUrl(e.target.value)} placeholder="https://..." />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={onGenerate} disabled={isGenerating} className="gap-2">
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Générer
        </Button>
      </div>
    </div>
  );
}
